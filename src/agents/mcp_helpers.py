"""
Shared MCP utilities for targeted tool calls from within the Docker network.

Used by code_analyzer and infra_analyzer to call specific Azure MCP tools
AFTER their Claude-based static analysis, enriching results with live Azure data.

Architecture: same SSE client approach as McpEnrichmentAgent — the Python backend
process (inside Docker) connects directly to the MCP SSE endpoints, since they
are not reachable from Anthropic's cloud API.
"""
from __future__ import annotations

import logging
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession
from mcp.client.sse import sse_client

logger = logging.getLogger(__name__)

_SSE_TIMEOUT = 15.0   # seconds per connection attempt
_MAX_TOOL_RESULT = 4000  # chars — keep Haiku context manageable


def _slug(name: str) -> str:
    """Convert display name to safe tool-name prefix."""
    return "".join(c if c.isalnum() else "_" for c in name).lower().strip("_")


def _extract_mcp_text(content_items: list) -> str:
    """Flatten MCP content list to plain string."""
    parts = []
    for item in content_items or []:
        if hasattr(item, "text"):
            parts.append(item.text)
        elif isinstance(item, dict):
            parts.append(item.get("text", str(item)))
        else:
            parts.append(str(item))
    return "\n".join(parts) or ""


async def targeted_mcp_call(
    mcp_servers: list[dict[str, Any]],
    tool_patterns: list[str],
    max_calls: int = 6,
) -> dict[str, str]:
    """
    Connect to active MCP servers via SSE, call tools whose names contain any
    of ``tool_patterns``, and return ``{prefixed_tool_name: result_text}``.

    Non-fatal: logs warnings on any error and returns partial or empty results.

    Args:
        mcp_servers:    List of MCP server configs (same format as AnalysisRequest.mcp_servers).
        tool_patterns:  Substrings to match against tool names (e.g. ["bestpractices", "cloudarchitect"]).
        max_calls:      Max number of tool calls total (to cap latency/cost).
    """
    active = [
        s for s in mcp_servers
        if s.get("enabled") and s.get("url") and s.get("type") == "url"
    ]
    if not active:
        return {}

    results: dict[str, str] = {}
    calls_made = 0

    try:
        async with AsyncExitStack() as stack:
            for srv in active:
                if calls_made >= max_calls:
                    break
                url = srv["url"]
                srv_name = srv.get("name", "mcp")
                prefix = _slug(srv_name)

                try:
                    read, write = await stack.enter_async_context(sse_client(url))
                    session = await stack.enter_async_context(ClientSession(read, write))
                    await session.initialize()
                    logger.debug("[mcp_helpers] Connected to '%s'", srv_name)
                except BaseException as exc:
                    if isinstance(exc, (SystemExit, KeyboardInterrupt)):
                        raise
                    logger.warning("[mcp_helpers] Cannot connect to '%s': %s", srv_name, exc)
                    continue

                try:
                    tools_resp = await session.list_tools()
                except Exception as exc:
                    logger.warning("[mcp_helpers] list_tools failed for '%s': %s", srv_name, exc)
                    continue

                for tool in tools_resp.tools:
                    if calls_made >= max_calls:
                        break
                    tool_name = tool.name
                    prefixed = f"{prefix}__{tool_name}"

                    # Match if any pattern appears in the tool name
                    if not any(pat in tool_name for pat in tool_patterns):
                        continue

                    try:
                        mcp_result = await session.call_tool(tool_name, {})
                        raw_text = _extract_mcp_text(mcp_result.content)
                        if raw_text:
                            results[prefixed] = raw_text[:_MAX_TOOL_RESULT]
                            calls_made += 1
                            logger.info("[mcp_helpers] Called tool '%s' → %d chars", prefixed, len(raw_text))
                    except Exception as exc:
                        logger.warning("[mcp_helpers] Tool '%s' error: %s", prefixed, exc)

    except BaseException as exc:
        if isinstance(exc, (SystemExit, KeyboardInterrupt)):
            raise
        logger.warning("[mcp_helpers] Unexpected error during targeted MCP call: %s", exc)

    logger.info("[mcp_helpers] targeted_mcp_call: %d results for patterns %s", len(results), tool_patterns)
    return results


async def synthesize_mcp_guidance(
    mcp_results: dict[str, str],
    analysis_summary: str,
    guidance_type: str,
    anthropic_api_key: str | None,
    model: str,
) -> dict[str, Any]:
    """
    Use Claude Haiku to extract structured guidelines from raw MCP tool outputs.

    Args:
        mcp_results:      {tool_name: raw_text} from targeted_mcp_call.
        analysis_summary: Brief description of what was found (languages, services…).
        guidance_type:    "app_code" or "infra" — controls the output schema.
        anthropic_api_key: Anthropic API key.
        model:            Model to use (Haiku recommended for cost efficiency).

    Returns structured dict with guidelines, or empty dict on failure.
    """
    if not mcp_results:
        return {}

    import anthropic  # lazy import

    tools_section = "\n\n".join(
        f"## Tool: {name}\n{text}" for name, text in mcp_results.items()
    )

    if guidance_type == "app_code":
        schema_instruction = """
Return ONLY valid JSON (no markdown) with this structure:
{
  "azure_guidelines": [
    {"area": "<area, e.g. Auth/Observability/CI-CD>", "guideline": "<concrete action>", "standard": "<OWASP/12-factor/SOLID/CNCF/Azure>", "priority": "high|medium|low"}
  ],
  "framework_guidance": {"<framework_name>": "<specific Azure migration notes>"},
  "quick_wins": ["<actionable item that can be done in <1 week>"],
  "tools_called": ["<tool_name>"]
}
Include 6-12 guidelines, 2-5 quick wins. Keep each guideline under 120 chars.
"""
    else:  # infra
        schema_instruction = """
Return ONLY valid JSON (no markdown) with this structure:
{
  "azure_guidelines": [
    {"area": "<area, e.g. Security/Networking/Compute/IaC>", "guideline": "<concrete action>", "standard": "<CAF/WAF/CIS/Azure>", "priority": "high|medium|low"}
  ],
  "service_guidance": {"<azure_service>": "<sizing/config notes>"},
  "iac_best_practices": ["<IaC-specific recommendation>"],
  "tools_called": ["<tool_name>"]
}
Include 6-12 guidelines, 2-5 IaC best practices. Keep each under 120 chars.
"""

    prompt = f"""You are an Azure migration expert. Below is a summary of what was found in the codebase/infrastructure,
followed by raw Azure documentation and best-practice data retrieved from Azure MCP tools.

## Analysis Summary
{analysis_summary}

## Azure MCP Tool Outputs
{tools_section}

Based on the analysis and Azure data above, extract the most relevant Azure-specific guidelines.
{schema_instruction}
"""

    try:
        client = anthropic.AsyncAnthropic(api_key=anthropic_api_key or None)
        response = await client.messages.create(
            model=model,
            max_tokens=2048,
            system="You are an Azure migration expert. Respond ONLY with valid JSON.",
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text
        # Strip possible markdown fences
        import re
        match = re.search(r"```(?:json)?\s*([\s\S]+?)```", raw)
        if match:
            raw = match.group(1).strip()
        import json
        data = json.loads(raw)
        # Always tag which tools were called
        data["tools_called"] = list(mcp_results.keys())
        return data
    except Exception as exc:
        logger.warning("[mcp_helpers] synthesize_mcp_guidance failed: %s", exc)
        # Return raw results if synthesis fails so data isn't lost
        return {
            "raw_results": {k: v[:500] for k, v in mcp_results.items()},
            "tools_called": list(mcp_results.keys()),
            "parse_error": True,
        }
