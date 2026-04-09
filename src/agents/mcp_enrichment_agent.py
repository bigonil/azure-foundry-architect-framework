"""
MCP Enrichment Agent — Phase 1.5 of the orchestration pipeline.

Architecture note
-----------------
Anthropic's MCP beta (betas=["mcp-client-2025-04-04"]) requires the MCP server
URLs to be **publicly reachable from Anthropic's cloud**.  Our MCP servers run
inside Docker containers with internal URLs (e.g. http://mcp-azure:3333/sse)
that Anthropic cannot reach — resulting in "Access to this MCP server is
blocked" errors.

Solution: the backend Python process (which *can* reach the Docker network)
acts as the MCP client itself.  We:
  1. Open SSE connections to each MCP server from the backend.
  2. Fetch the full tool list from every server.
  3. Pass those tools to Claude as regular Anthropic tool definitions.
  4. Run a local tool-use agentic loop:
       Claude proposes tool call → we execute it via MCP → return result to Claude.
  5. Extract the final JSON response when Claude stops calling tools.

This is equivalent to the MCP beta but runs entirely inside our network.
"""
from __future__ import annotations

import json
import logging
import time
from contextlib import AsyncExitStack
from typing import Any

import anthropic
from mcp import ClientSession
from mcp.client.sse import sse_client

from src.agents.base_agent import AgentResult, BaseAgent

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 12          # safety cap on the tool-use loop
MAX_TOOLS_PER_SERVER = 60   # avoid context overflow


def _slug(name: str) -> str:
    """Convert a server display name to a safe tool-name prefix."""
    return "".join(c if c.isalnum() else "_" for c in name).lower().strip("_")


class McpEnrichmentAgent(BaseAgent):
    """
    Enriches migration analysis with real Azure intelligence via MCP Skills.

    Phase 1.5: runs after code_analyzer + infra_analyzer, before Phase 2 agents.
    Requires at least one active Azure MCP server. Gracefully skipped otherwise.

    Overrides BaseAgent.run() to implement a *local* MCP client loop instead of
    delegating MCP execution to the Anthropic API.
    """

    @property
    def agent_name(self) -> str:
        return "mcp_enrichment"

    def get_tools(self) -> list:
        return []  # tools come from MCP servers at runtime

    # ──────────────────────────────────────────────────────────────────────────
    # Entry point — overrides BaseAgent.run()
    # ──────────────────────────────────────────────────────────────────────────

    async def run(
        self,
        context: dict[str, Any],
        session_id: str | None = None,
        mcp_servers: list[dict[str, Any]] | None = None,
    ) -> AgentResult:
        start = time.monotonic()

        active = [
            s for s in (mcp_servers or [])
            if s.get("enabled", True) and s.get("url") and s.get("type") == "url"
        ]
        if not active:
            logger.info("[mcp_enrichment] No active MCP servers — skipping Phase 1.5")
            return AgentResult(
                agent_name=self.agent_name, session_id=session_id or "",
                status="skipped", data={}, duration_seconds=0.0,
            )

        try:
            result_data, in_tok, out_tok = await self._local_mcp_loop(
                context, active
            )
            duration = time.monotonic() - start
            logger.info(
                "[mcp_enrichment] Completed in %.1fs — tokens: %d↑ %d↓",
                duration, in_tok, out_tok,
            )
            return AgentResult(
                agent_name=self.agent_name, session_id=session_id or "",
                status="success", data=result_data,
                duration_seconds=duration,
                input_tokens=in_tok, output_tokens=out_tok,
            )
        except BaseException as exc:
            # Catch BaseExceptionGroup (Python 3.11 anyio TaskGroup errors from MCP SSE)
            # as well as regular Exception. Re-raise hard exits.
            if isinstance(exc, (SystemExit, KeyboardInterrupt)):
                raise
            duration = time.monotonic() - start
            logger.error("[mcp_enrichment] Failed after %.1fs: %s", duration, exc)
            return AgentResult(
                agent_name=self.agent_name, session_id=session_id or "",
                status="failed", data={"error": str(exc)},
                duration_seconds=duration,
            )

    # ──────────────────────────────────────────────────────────────────────────
    # Local MCP client + Claude tool-use loop
    # ──────────────────────────────────────────────────────────────────────────

    async def _local_mcp_loop(
        self,
        context: dict[str, Any],
        mcp_servers: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], int, int]:

        # Use Haiku for the tool-use loop: many back-and-forth calls exhaust Opus rate limits.
        # Haiku has 10× higher TPM limits and is well-suited for tool orchestration.
        model = self.settings.anthropic_model_mcp
        client = anthropic.AsyncAnthropic(
            api_key=self.settings.anthropic_api_key or None
        )
        total_in = total_out = 0

        async with AsyncExitStack() as stack:
            # ── 1. Open SSE connections to all MCP servers ───────────────────
            named_sessions: list[tuple[str, ClientSession]] = []
            for srv in mcp_servers:
                url = srv.get("url", "")
                name = srv.get("name", "mcp")
                if not url:
                    continue
                try:
                    read, write = await stack.enter_async_context(sse_client(url))
                    session = await stack.enter_async_context(ClientSession(read, write))
                    await session.initialize()
                    named_sessions.append((name, session))
                    logger.info("[mcp_enrichment] Connected to '%s' at %s", name, url)
                except BaseException as exc:
                    if isinstance(exc, (SystemExit, KeyboardInterrupt)):
                        raise
                    # BaseExceptionGroup is raised by anyio TaskGroup when the SSE
                    # connection closes abruptly (e.g. DevOps MCP auth failure during init)
                    exc_msg = (
                        "; ".join(str(e) for e in exc.exceptions)  # type: ignore[attr-defined]
                        if hasattr(exc, "exceptions")
                        else str(exc)
                    )
                    logger.warning(
                        "[mcp_enrichment] Cannot reach '%s' (%s): %s — skipping",
                        name, url, exc_msg,
                    )

            if not named_sessions:
                raise RuntimeError(
                    "No MCP servers reachable from backend. "
                    "Check that the MCP Docker containers are running: "
                    "docker compose --profile mcp up -d mcp-azure mcp-devops"
                )

            # ── 2. Collect tools from all sessions ───────────────────────────
            anthropic_tools: list[dict] = []
            # prefixed_name → (original_tool_name, ClientSession)
            tool_map: dict[str, tuple[str, ClientSession]] = {}

            for srv_name, sess in named_sessions:
                prefix = _slug(srv_name)
                try:
                    tools_resp = await sess.list_tools()
                    for tool in tools_resp.tools[:MAX_TOOLS_PER_SERVER]:
                        prefixed = f"{prefix}__{tool.name}"
                        schema = tool.inputSchema or {"type": "object", "properties": {}}
                        anthropic_tools.append({
                            "name": prefixed,
                            "description": (tool.description or "")[:1024],
                            "input_schema": schema,
                        })
                        tool_map[prefixed] = (tool.name, sess)
                except Exception as exc:
                    logger.warning(
                        "[mcp_enrichment] list_tools failed for '%s': %s", srv_name, exc
                    )

            logger.info(
                "[mcp_enrichment] %d tools collected from %d server(s)",
                len(anthropic_tools), len(named_sessions),
            )

            # ── 3. Claude tool-use loop ───────────────────────────────────────
            messages: list[dict] = [
                {"role": "user", "content": self.build_user_message(context)}
            ]

            last_response = None
            for iteration in range(MAX_ITERATIONS):
                try:
                    response = await client.messages.create(
                        model=model,
                        max_tokens=self.max_tokens,
                        system=self.system_prompt,
                        tools=anthropic_tools,
                        messages=messages,
                    )
                except anthropic.RateLimitError:
                    logger.warning(
                        "[mcp_enrichment] Rate limit hit at iteration %d — returning partial results",
                        iteration,
                    )
                    break  # exit loop, return whatever we have so far

                last_response = response
                total_in += response.usage.input_tokens
                total_out += response.usage.output_tokens

                tool_calls = [b for b in response.content if b.type == "tool_use"]

                if response.stop_reason == "end_turn" or not tool_calls:
                    # Final answer — extract last text block
                    text = next(
                        (b.text for b in reversed(response.content) if hasattr(b, "text")),
                        "",
                    )
                    return self.parse_response(self._extract_json(text)), total_in, total_out

                # Execute tool calls locally and feed results back
                messages.append({"role": "assistant", "content": response.content})
                tool_results = []
                for tc in tool_calls:
                    orig_name, sess = tool_map.get(tc.name, (None, None))
                    if orig_name and sess:
                        try:
                            mcp_result = await sess.call_tool(orig_name, tc.input or {})
                            content_str = _extract_mcp_text(mcp_result.content)
                        except Exception as exc:
                            content_str = f"Tool execution error: {exc}"
                    else:
                        content_str = f"Unknown tool: {tc.name}"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": content_str,
                    })
                    logger.debug("[mcp_enrichment] Tool %s → %d chars", tc.name, len(content_str))

                messages.append({"role": "user", "content": tool_results})

            # Reached MAX_ITERATIONS — take whatever text is available
            if last_response:
                text = next(
                    (b.text for b in reversed(last_response.content) if hasattr(b, "text")),
                    "",
                )
                return self.parse_response(self._extract_json(text)), total_in, total_out

            return {}, total_in, total_out

    # ──────────────────────────────────────────────────────────────────────────
    # User message builder
    # ──────────────────────────────────────────────────────────────────────────

    def build_user_message(self, context: dict[str, Any]) -> str:
        code_results = context.get("code_analyzer_results", {})
        infra_results = context.get("infra_analyzer_results", {})
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")
        project_name = context.get("project_name", "")
        devops_org = context.get("azure_devops_org", "")

        tech_inventory = code_results.get("technology_inventory", {})
        arch_patterns = code_results.get("architecture_patterns", {})
        coupling = code_results.get("cloud_coupling", {})
        coupling_score = code_results.get("coupling_score", "UNKNOWN")

        resource_inventory = infra_results.get("resource_inventory", [])
        service_mapping = infra_results.get("service_mapping", [])
        total_resources = infra_results.get("total_resources", len(resource_inventory))

        phase1_summary = {
            "source_cloud": source_cloud,
            "target_cloud": target_cloud,
            "project": project_name,
            "cloud_coupling_score": coupling_score,
            "languages": tech_inventory.get("languages", []),
            "frameworks": tech_inventory.get("frameworks", []),
            "architecture_type": arch_patterns.get("type", "unknown"),
            "total_resources": total_resources,
            "source_services_detected": [
                s.get("source_service") for s in service_mapping[:20] if s.get("source_service")
            ],
            "azure_target_services": [
                s.get("azure_equivalent") for s in service_mapping[:20] if s.get("azure_equivalent")
            ],
            "cloud_sdk_references": coupling.get("sdks_detected", []),
        }

        devops_section = ""
        if devops_org:
            devops_section = (
                f"\n## Azure DevOps Context\nOrganization: {devops_org}\n"
                "If Azure DevOps MCP tools are available, call:\n"
                "- core_list_projects to list migration-related projects\n"
                "- repo_list_repos_by_project to understand repo structure\n"
                "- pipelines_get_builds to assess CI/CD maturity\n"
                "- wit_list_backlogs to identify existing migration work items\n"
            )

        return f"""
Enrich the following cloud migration analysis using ALL available Azure MCP tools and Skills.

## Phase 1 Analysis Summary
{json.dumps(phase1_summary, indent=2)}

## Your Task
Use the available tools to gather real Azure intelligence. CALL EVERY RELEVANT TOOL.

**START HERE — call these tools FIRST in this exact order:**
1. Call **azuremigrate** tool immediately — assess migration readiness, blockers, and suitability for Azure of this workload. This is the MOST IMPORTANT call.
2. Call **pricing** to get actual Azure pricing for the target services identified above
3. Call **advisor** to get Azure Advisor recommendations for this migration scenario
4. Call **wellarchitectedframework** to assess the proposed target architecture
5. Call **cloudarchitect** to get matching reference architectures
6. Call **get_azure_bestpractices** for the specific services and migration pattern
7. Call service-specific tools for each detected technology:
   - databases: sql / postgres / mysql / cosmos / redis (as appropriate)
   - messaging: servicebus / eventhubs / eventgrid (as appropriate)
   - compute: aks / appservice / containerapps / functions (as appropriate)
   - storage: storage / fileshares (as appropriate)
   - security: keyvault / role / policy (as appropriate)
   - observability: monitor / applicationinsights (as appropriate)
{devops_section}
## Required Output
After calling all relevant tools, return a comprehensive JSON object:
{{
  "migration_readiness": {{
    "overall_score": "<percentage or rating>",
    "suitability": "<cloud|conditional|not suitable>",
    "blockers": ["<blocker>"],
    "recommendations": ["<recommendation>"]
  }},
  "azure_pricing_estimate": {{
    "monthly_eur": <number>,
    "breakdown": [{{"service": "<name>", "sku": "<sku>", "monthly_eur": <number>}}],
    "assumptions": ["<assumption>"]
  }},
  "advisor_recommendations": [
    {{"category": "<cost|security|reliability|performance|ops>", "severity": "<high|medium|low>", "recommendation": "<text>", "impact": "<text>"}}
  ],
  "waf_assessment": {{
    "reliability": {{"score": <1-5>, "findings": ["<finding>"]}},
    "security": {{"score": <1-5>, "findings": ["<finding>"]}},
    "cost_optimization": {{"score": <1-5>, "findings": ["<finding>"]}},
    "operational_excellence": {{"score": <1-5>, "findings": ["<finding>"]}},
    "performance_efficiency": {{"score": <1-5>, "findings": ["<finding>"]}}
  }},
  "reference_architectures": [
    {{"name": "<arch name>", "url": "<docs url>", "fit_score": <1-5>, "description": "<text>"}}
  ],
  "service_guidance": {{
    "<azure_service_name>": {{
      "sku_recommendation": "<sku>",
      "migration_notes": "<text>",
      "docs_url": "<url>"
    }}
  }},
  "best_practices": ["<practice>"],
  "devops_context": {{
    "projects": [],
    "repos": [],
    "pipelines": [],
    "work_items": []
  }},
  "azure_skills_called": ["<skill_name>"],
  "enrichment_quality": "<high|medium|low>"
}}
"""

    # ──────────────────────────────────────────────────────────────────────────
    # Response parser
    # ──────────────────────────────────────────────────────────────────────────

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            return {
                "migration_readiness": data.get("migration_readiness", {}),
                "azure_pricing_estimate": data.get("azure_pricing_estimate", {}),
                "advisor_recommendations": data.get("advisor_recommendations", []),
                "waf_assessment": data.get("waf_assessment", {}),
                "reference_architectures": data.get("reference_architectures", []),
                "service_guidance": data.get("service_guidance", {}),
                "best_practices": data.get("best_practices", []),
                "devops_context": data.get("devops_context", {}),
                "azure_skills_called": data.get("azure_skills_called", []),
                "enrichment_quality": data.get("enrichment_quality", "unknown"),
                "raw": data,
            }
        except (json.JSONDecodeError, TypeError):
            logger.warning("[mcp_enrichment] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_mcp_text(content_items: list) -> str:
    """Flatten MCP content list to a single string for Claude."""
    parts = []
    for item in content_items or []:
        if hasattr(item, "text"):
            parts.append(item.text)
        elif isinstance(item, dict):
            parts.append(item.get("text", str(item)))
        else:
            parts.append(str(item))
    return "\n".join(parts) or "No result"
