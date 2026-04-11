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

import asyncio
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

MAX_ITERATIONS = 25          # safety cap on the tool-use loop
MAX_TOOLS_PER_SERVER = 60   # avoid context overflow
SSE_CONNECT_RETRIES = 3     # retry SSE connection on transient disconnects
SSE_RETRY_DELAY = 2.0       # seconds between retries


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
            # ── 1. Open SSE connections to all MCP servers (with retry) ─────
            named_sessions: list[tuple[str, ClientSession]] = []
            for srv in mcp_servers:
                url = srv.get("url", "")
                name = srv.get("name", "mcp")
                if not url:
                    continue
                connected = False
                for attempt in range(1, SSE_CONNECT_RETRIES + 1):
                    try:
                        read, write = await stack.enter_async_context(sse_client(url))
                        session = await stack.enter_async_context(ClientSession(read, write))
                        await session.initialize()
                        named_sessions.append((name, session))
                        logger.info("[mcp_enrichment] Connected to '%s' at %s", name, url)
                        connected = True
                        break
                    except BaseException as exc:
                        if isinstance(exc, (SystemExit, KeyboardInterrupt)):
                            raise
                        exc_msg = (
                            "; ".join(str(e) for e in exc.exceptions)  # type: ignore[attr-defined]
                            if hasattr(exc, "exceptions")
                            else str(exc)
                        )
                        if attempt < SSE_CONNECT_RETRIES:
                            logger.warning(
                                "[mcp_enrichment] '%s' attempt %d/%d failed (%s) — retrying in %.0fs",
                                name, attempt, SSE_CONNECT_RETRIES, exc_msg, SSE_RETRY_DELAY,
                            )
                            await asyncio.sleep(SSE_RETRY_DELAY)
                        else:
                            logger.warning(
                                "[mcp_enrichment] Cannot reach '%s' (%s): %s — skipping",
                                name, url, exc_msg,
                            )
                if not connected:
                    continue

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

            # ── 3. Mandatory azuremigrate pre-call ───────────────────────────
            # Guarantee migration data even if Claude skips the tool.
            # Find any tool whose name contains "azuremigrate".
            azuremigrate_result: str = ""
            for prefixed_name, (orig_name, sess) in tool_map.items():
                if "azuremigrate" in prefixed_name.lower():
                    logger.info("[mcp_enrichment] Pre-calling mandatory tool: %s", prefixed_name)
                    try:
                        mcp_result = await sess.call_tool(orig_name, {})
                        azuremigrate_result = _extract_mcp_text(mcp_result.content)
                        logger.info(
                            "[mcp_enrichment] azuremigrate returned %d chars",
                            len(azuremigrate_result),
                        )
                    except Exception as exc:
                        logger.warning("[mcp_enrichment] azuremigrate pre-call failed: %s", exc)
                    break

            # ── 4. Claude tool-use loop ───────────────────────────────────────
            azure_migrate_section = ""
            if azuremigrate_result:
                azure_migrate_section = (
                    f"\n\n## Azure Migrate Data (already fetched)\n"
                    f"The following data was retrieved from the Azure Migrate skill "
                    f"and MUST be included in your JSON response under "
                    f"`migration_readiness` and `azure_migrate_raw`:\n\n"
                    f"{azuremigrate_result[:8000]}\n"
                )

            messages: list[dict] = [
                {"role": "user", "content": self.build_user_message(context) + azure_migrate_section}
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
        monthly_cost_usd = context.get("current_monthly_cost_usd", 0) or 0
        additional_context = context.get("additional_context", "")

        # ── Code analysis context ──────────────────────────────────────────────
        tech_inventory = code_results.get("technology_inventory", {})
        arch_patterns = code_results.get("architecture_patterns", {})
        coupling = code_results.get("cloud_coupling", {})
        coupling_score = code_results.get("coupling_score", "UNKNOWN")
        dependencies = code_results.get("dependencies", [])
        security_issues = code_results.get("security_findings", [])

        # ── Infra analysis context ─────────────────────────────────────────────
        resource_inventory = infra_results.get("resource_inventory", [])
        service_mapping = infra_results.get("service_mapping", [])
        total_resources = infra_results.get("total_resources", len(resource_inventory))
        network_topology = infra_results.get("network_topology", {})
        security_posture = infra_results.get("security_posture", {})
        migration_complexity = infra_results.get("migration_complexity", {})
        estimated_azure_monthly = infra_results.get("estimated_azure_monthly_cost_usd", 0) or 0

        # Build full service mapping table
        svc_mapping_rows = []
        for s in service_mapping[:30]:
            src = s.get("source_service", "")
            tgt = s.get("azure_equivalent", "")
            migration_type = s.get("migration_type", "")
            complexity = s.get("complexity", "")
            if src or tgt:
                svc_mapping_rows.append({
                    "source_service": src,
                    "azure_target": tgt,
                    "migration_type": migration_type,
                    "complexity": complexity,
                    "notes": s.get("notes", ""),
                })

        # Build resource list for pricing calls
        resource_summary = []
        for r in resource_inventory[:20]:
            resource_summary.append({
                "type": r.get("type", r.get("resource_type", "")),
                "name": r.get("name", ""),
                "region": r.get("region", ""),
                "size": r.get("size", r.get("instance_type", "")),
            })

        phase1_context = {
            "project": project_name,
            "source_cloud": source_cloud,
            "target_cloud": target_cloud,
            "current_monthly_cost_usd": monthly_cost_usd,
            "infra_analyzer_estimated_azure_cost_usd": estimated_azure_monthly,
            "cloud_coupling_score": coupling_score,
            "languages": tech_inventory.get("languages", []),
            "frameworks": tech_inventory.get("frameworks", []),
            "cloud_sdks_detected": coupling.get("sdks_detected", []),
            "architecture_type": arch_patterns.get("type", "unknown"),
            "architecture_patterns": arch_patterns.get("patterns", []),
            "total_infra_resources": total_resources,
            "key_dependencies": dependencies[:10],
            "security_findings": security_issues[:5],
            "network_topology": network_topology,
            "security_posture": security_posture,
            "migration_complexity": migration_complexity,
        }

        devops_section = ""
        if devops_org:
            devops_section = (
                f"\n## Azure DevOps Context\nOrganization: `{devops_org}`\n"
                "Call these DevOps tools in sequence:\n"
                "1. `core_list_projects` — list all projects\n"
                "2. `repo_list_repos_by_project` — list repositories (use first relevant project)\n"
                "3. `pipelines_get_builds` — assess CI/CD maturity and pipeline health\n"
                "4. `wit_list_backlogs` — check existing migration work items\n"
                "5. `search_workitem` with query 'migration' — find migration-related items\n"
                "Include all findings in `devops_context` in the output.\n"
            )

        additional_section = ""
        if additional_context:
            additional_section = f"\n## Additional Context from Customer\n{additional_context}\n"

        return f"""
You are the Azure MCP Enrichment Agent. Your mission: produce a COMPREHENSIVE Azure migration
intelligence report by calling ALL relevant Azure MCP tools.

DO NOT generate estimates from training data alone. Call the tools, get REAL data.
CALL AS MANY TOOLS AS NEEDED — minimum 10 tool calls expected for a quality report.

## Phase 1 Analysis Results
```json
{json.dumps(phase1_context, indent=2)}
```

## Detected Source→Azure Service Mapping (from infra_analyzer)
```json
{json.dumps(svc_mapping_rows, indent=2)}
```

## Infrastructure Resources to Price
```json
{json.dumps(resource_summary, indent=2)}
```
{additional_section}
## MANDATORY Tool Call Sequence — execute in this order:

### BLOCK 1 — Migration Assessment (call first, always)
1. `azuremigrate` — migration readiness, suitability, discovered dependencies, blockers
2. `cloudarchitect` — reference architectures for {source_cloud}→Azure migration pattern with {arch_patterns.get("type", "this architecture")}

### BLOCK 2 — Pricing & Cost (call for EVERY detected service)
3. `pricing` — get Azure Retail Prices for the target services above; build a line-by-line cost estimate
   - For each resource in the resource list above, get actual SKU pricing
   - Include compute, storage, networking, databases, messaging in your pricing calls
   - Target: produce a monthly EUR estimate that replaces the current ${monthly_cost_usd}/mo

### BLOCK 3 — Architecture & Best Practices
4. `wellarchitectedframework` — WAF assessment for the proposed Azure target architecture
5. `get_azure_bestpractices` — best practices for {source_cloud}→Azure migration
6. `documentation` — get migration guides for {source_cloud} to Azure
{"7. `azureterraformbestpractices` — IaC best practices (Terraform detected)" if any("terraform" in str(d).lower() for d in dependencies[:10]) else ""}

### BLOCK 4 — Service-Specific Guidance (call for EACH detected service)
Based on the service mapping above, call the relevant tools:
{"- `aks` — AKS guidance (Kubernetes detected)" if any("k8s" in str(s).lower() or "kubernetes" in str(s).lower() or "aks" in str(s).lower() for s in svc_mapping_rows) else ""}
{"- `appservice` — App Service guidance (web app detected)" if any("app_service" in str(s).lower() or "appservice" in str(s).lower() or "elastic_beanstalk" in str(s).lower() for s in svc_mapping_rows) else ""}
{"- `containerapps` — Container Apps (containerized workload detected)" if any("container" in str(s).lower() or "ecs" in str(s).lower() or "fargate" in str(s).lower() for s in svc_mapping_rows) else ""}
{"- `sql` / `postgres` / `mysql` — database migration guidance" if any(db in str(svc_mapping_rows).lower() for db in ["sql", "postgres", "mysql", "rds"]) else ""}
{"- `cosmos` — Cosmos DB guidance (NoSQL detected)" if any(db in str(svc_mapping_rows).lower() for db in ["dynamodb", "mongo", "cosmos", "nosql"]) else ""}
{"- `servicebus` / `eventhubs` — messaging migration" if any(q in str(svc_mapping_rows).lower() for q in ["sqs", "kafka", "rabbitmq", "servicebus", "eventhub"]) else ""}
{"- `storage` — Blob Storage migration (S3/object storage detected)" if any("s3" in str(s).lower() or "storage" in str(s).lower() for s in svc_mapping_rows) else ""}
{"- `functions` / `functionapp` — serverless migration (Lambda detected)" if any("lambda" in str(s).lower() or "function" in str(s).lower() for s in svc_mapping_rows) else ""}
- `keyvault` — secrets and certificate management guidance
- `monitor` — observability setup guidance
- `applicationinsights` — APM setup guidance
- `advisor` — Azure Advisor recommendations for this workload
- `role` — managed identity and RBAC setup
- `policy` — governance and compliance
{devops_section}
## REQUIRED JSON Output

After completing ALL tool calls above, return this comprehensive JSON:

```json
{{
  "migration_readiness": {{
    "overall_score": "<e.g. 78% or High/Medium/Low>",
    "suitability": "<cloud|conditional|not_suitable>",
    "blockers": ["<specific blocker with details>"],
    "recommendations": ["<actionable recommendation>"],
    "dependencies_detected": ["<external dependency>"],
    "estimated_migration_effort_weeks": <number>
  }},
  "azure_migrate_raw": "<verbatim text from Azure Migrate skill>",
  "aws_to_azure_service_mapping": [
    {{
      "source_service": "<AWS/GCP/on-prem service name>",
      "source_tier": "<e.g. t3.large, db.r5.2xlarge>",
      "azure_target": "<exact Azure service name>",
      "azure_sku": "<e.g. Standard_D2s_v3, GP_Gen5_4>",
      "migration_approach": "<lift-and-shift|re-platform|re-architect>",
      "estimated_monthly_eur": <number>,
      "migration_complexity": "<low|medium|high>",
      "migration_steps": ["<step 1>", "<step 2>"],
      "azure_docs_url": "<url>"
    }}
  ],
  "azure_pricing_estimate": {{
    "monthly_eur": <total>,
    "current_monthly_eur": <converted from ${monthly_cost_usd}>,
    "savings_pct": <percentage>,
    "breakdown": [
      {{
        "service": "<azure service>",
        "sku": "<sku>",
        "quantity": "<e.g. 2x vCores>",
        "monthly_eur": <number>,
        "notes": "<e.g. includes reserved instance discount>"
      }}
    ],
    "cost_optimization_tips": ["<tip>"],
    "assumptions": ["<assumption>"]
  }},
  "advisor_recommendations": [
    {{
      "category": "<cost|security|reliability|performance|operational_excellence>",
      "severity": "<high|medium|low>",
      "recommendation": "<detailed text>",
      "impact": "<quantified impact if possible>",
      "implementation_steps": ["<step>"]
    }}
  ],
  "waf_assessment": {{
    "reliability": {{
      "score": <1-5>,
      "findings": ["<finding>"],
      "recommendations": ["<recommendation>"]
    }},
    "security": {{
      "score": <1-5>,
      "findings": ["<finding>"],
      "recommendations": ["<recommendation>"]
    }},
    "cost_optimization": {{
      "score": <1-5>,
      "findings": ["<finding>"],
      "recommendations": ["<recommendation>"]
    }},
    "operational_excellence": {{
      "score": <1-5>,
      "findings": ["<finding>"],
      "recommendations": ["<recommendation>"]
    }},
    "performance_efficiency": {{
      "score": <1-5>,
      "findings": ["<finding>"],
      "recommendations": ["<recommendation>"]
    }}
  }},
  "reference_architectures": [
    {{
      "name": "<architecture name>",
      "url": "<Microsoft Learn / Azure Docs URL>",
      "fit_score": <1-5>,
      "description": "<why this matches>",
      "key_components": ["<component>"]
    }}
  ],
  "service_guidance": {{
    "<azure_service_name>": {{
      "sku_recommendation": "<specific SKU with justification>",
      "sizing_notes": "<CPU/RAM/storage sizing based on source>",
      "migration_notes": "<step-by-step migration guidance>",
      "configuration_tips": ["<tip>"],
      "docs_url": "<url>",
      "estimated_monthly_eur": <number>
    }}
  }},
  "infrastructure_recommendations": [
    {{
      "area": "<networking|security|scalability|resilience|cost>",
      "priority": "<critical|high|medium|low>",
      "recommendation": "<detailed recommendation>",
      "rationale": "<why this matters>",
      "effort": "<days estimate>"
    }}
  ],
  "migration_path": {{
    "recommended_approach": "<lift-and-shift|re-platform|re-architect|hybrid>",
    "rationale": "<why this approach>",
    "phases": [
      {{
        "phase": 1,
        "name": "<phase name>",
        "duration_weeks": <number>,
        "services_to_migrate": ["<service>"],
        "key_activities": ["<activity>"],
        "risks": ["<risk>"],
        "dependencies": ["<dependency>"]
      }}
    ],
    "critical_path_items": ["<item>"],
    "quick_wins": ["<win achievable in <2 weeks>"]
  }},
  "best_practices": ["<specific best practice with context>"],
  "devops_context": {{
    "projects": [],
    "repos": [],
    "pipelines": [],
    "work_items": [],
    "ci_cd_maturity": "<low|medium|high>",
    "migration_items_found": <number>
  }},
  "azure_skills_called": ["<skill_name>"],
  "enrichment_quality": "<high|medium|low>",
  "enrichment_notes": "<any caveats about missing data or partial results>"
}}
```

IMPORTANT:
- `azure_migrate_raw`: copy the full verbatim text from the Azure Migrate skill result already provided
- `aws_to_azure_service_mapping`: build one entry per source service using REAL pricing from the pricing tool
- `azure_pricing_estimate.monthly_eur`: must be computed from REAL pricing tool results, not estimates
- Every `docs_url` must be a real Microsoft Learn or Azure documentation URL from the documentation tool
"""

    # ──────────────────────────────────────────────────────────────────────────
    # Response parser
    # ──────────────────────────────────────────────────────────────────────────

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            if isinstance(data, list):
                data = {}
            return {
                "migration_readiness": data.get("migration_readiness", {}),
                "azure_migrate_raw": data.get("azure_migrate_raw", ""),
                "aws_to_azure_service_mapping": data.get("aws_to_azure_service_mapping", []),
                "azure_pricing_estimate": data.get("azure_pricing_estimate", {}),
                "advisor_recommendations": data.get("advisor_recommendations", []),
                "waf_assessment": data.get("waf_assessment", {}),
                "reference_architectures": data.get("reference_architectures", []),
                "service_guidance": data.get("service_guidance", {}),
                "infrastructure_recommendations": data.get("infrastructure_recommendations", []),
                "migration_path": data.get("migration_path", {}),
                "best_practices": data.get("best_practices", []),
                "devops_context": data.get("devops_context", {}),
                "azure_skills_called": data.get("azure_skills_called", []),
                "enrichment_quality": data.get("enrichment_quality", "unknown"),
                "enrichment_notes": data.get("enrichment_notes", ""),
                "raw": data,
            }
        except (json.JSONDecodeError, TypeError, AttributeError):
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
