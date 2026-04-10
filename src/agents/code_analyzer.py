"""
Code Analyzer Agent — analyzes application source code repositories.
Detects languages, frameworks, cloud coupling, patterns, and technical debt.

Opzione A: Claude analysis guided by OWASP Top 10, SOLID, 12-factor, CNCF standards.
Opzione B: After static analysis, calls Azure MCP tools (bestpractices, cloudarchitect)
           to enrich results with live Azure-specific app migration guidance.
Also fetches SonarCloud static analysis data when available.
"""
import json
import logging
from pathlib import Path
from typing import Any

from src.agents.base_agent import BaseAgent
from src.tools.code_scanner import CodeScanner
from src.tools.sonarcloud_client import SonarCloudClient

logger = logging.getLogger(__name__)

# Azure MCP tool patterns relevant to app/code analysis
_CODE_MCP_PATTERNS = [
    "get_azure_bestpractices",
    "cloudarchitect",
]
# Conditionally added based on detected architecture
_SERVERLESS_PATTERNS = ["functionapp", "functions"]
_CONTAINER_PATTERNS  = ["containerapps", "appservice"]
_AKS_PATTERNS        = ["aks"]


class CodeAnalyzerAgent(BaseAgent):
    """Analyzes application source code for cloud migration readiness.

    Phase 1 agent. Run order:
    1. SonarCloud fetch (non-blocking)
    2. Claude static analysis (Opzione A — OWASP/SOLID/12-factor/CNCF in prompt)
    3. Azure MCP enrichment (Opzione B — if MCP servers active)
       → calls get_azure_bestpractices + cloudarchitect + optional service tools
       → synthesizes raw MCP outputs into structured `mcp_guidance` via Haiku
    """

    @property
    def agent_name(self) -> str:
        return "code_analyzer"

    def get_tools(self) -> list:
        if self.settings.llm_provider == "azure":
            from azure.ai.projects.models import CodeInterpreterTool  # noqa: PLC0415
            return [CodeInterpreterTool()]
        return []

    # ── Override run() to add SonarCloud + MCP enrichment ────────────────────

    async def run(
        self,
        context: dict[str, Any],
        session_id: str | None = None,
        mcp_servers: list[dict[str, Any]] | None = None,
    ):
        """Fetch SonarCloud data, run Claude analysis, then MCP enrich if active."""
        project_name = context.get("project_name", "")
        sonar_data = await self._fetch_sonarcloud(project_name)

        # Inject SonarCloud data into context so build_user_message can reference it
        enriched_context = {**context, "_sonarcloud": sonar_data}

        # ── Step 1: Claude static analysis (Opzione A) ────────────────────────
        result = await super().run(enriched_context, session_id, mcp_servers=None)
        result.data["sonarqube_analysis"] = sonar_data

        # ── Step 2: Azure MCP enrichment (Opzione B) ─────────────────────────
        if mcp_servers and self.settings.llm_provider == "anthropic":
            mcp_guidance = await self._enrich_with_mcp(mcp_servers, result.data)
            if mcp_guidance:
                result.data["mcp_guidance"] = mcp_guidance
                logger.info(
                    "[code_analyzer] MCP guidance added — tools called: %s",
                    mcp_guidance.get("tools_called", []),
                )

        return result

    # ── SonarCloud helper ─────────────────────────────────────────────────────

    async def _fetch_sonarcloud(self, project_name: str) -> dict[str, Any]:
        if not self.settings.sonarcloud_token:
            return {"error": "SONARCLOUD_TOKEN not set — skipping SonarCloud analysis"}
        try:
            client = SonarCloudClient()
            data = await client.analyze_project(project_name)
            if "error" in data:
                logger.warning("[code_analyzer] SonarCloud: %s", data["error"])
            else:
                logger.info("[code_analyzer] SonarCloud data fetched for '%s'", project_name)
            return data
        except Exception as exc:
            logger.warning("[code_analyzer] SonarCloud fetch failed: %s", exc)
            return {"error": str(exc)}

    # ── MCP enrichment (Opzione B) ────────────────────────────────────────────

    async def _enrich_with_mcp(
        self,
        mcp_servers: list[dict[str, Any]],
        analysis_data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Call Azure MCP tools relevant to the detected tech stack and synthesize
        into structured app-migration guidance.
        """
        from src.agents.mcp_helpers import targeted_mcp_call, synthesize_mcp_guidance

        # Build tool patterns based on detected architecture
        patterns = list(_CODE_MCP_PATTERNS)
        arch = analysis_data.get("architecture_patterns", {})
        arch_type = (arch.get("type") or "").lower()
        if "serverless" in arch_type:
            patterns += _SERVERLESS_PATTERNS
        elif "container" in arch_type or "microservice" in arch_type:
            patterns += _CONTAINER_PATTERNS
        else:
            patterns += _CONTAINER_PATTERNS  # appservice is relevant for most apps

        logger.info("[code_analyzer] MCP enrichment — calling patterns: %s", patterns)

        try:
            mcp_results = await targeted_mcp_call(
                mcp_servers=mcp_servers,
                tool_patterns=patterns,
                max_calls=5,
            )
        except Exception as exc:
            logger.warning("[code_analyzer] targeted_mcp_call failed: %s", exc)
            return {}

        if not mcp_results:
            logger.info("[code_analyzer] No MCP results — skipping synthesis")
            return {}

        # Build a concise analysis summary for the synthesis prompt
        tech = analysis_data.get("technology_inventory", {})
        languages  = tech.get("languages", [])
        frameworks = tech.get("frameworks", [])
        coupling   = analysis_data.get("coupling_score", "UNKNOWN")
        summary = (
            f"Languages: {', '.join(languages) or 'unknown'}. "
            f"Frameworks: {', '.join(frameworks) or 'unknown'}. "
            f"Cloud coupling: {coupling}. "
            f"Architecture: {arch_type or 'unknown'}."
        )

        try:
            guidance = await synthesize_mcp_guidance(
                mcp_results=mcp_results,
                analysis_summary=summary,
                guidance_type="app_code",
                anthropic_api_key=self.settings.anthropic_api_key,
                model=self.settings.anthropic_model_mcp,
            )
        except Exception as exc:
            logger.warning("[code_analyzer] MCP synthesis failed: %s", exc)
            return {}

        return guidance

    # ── build_user_message ────────────────────────────────────────────────────

    def build_user_message(self, context: dict[str, Any]) -> str:
        artifacts = context.get("code_artifacts", [])
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")
        sonar = context.get("_sonarcloud", {})

        scan_summary = self._pre_scan_artifacts(artifacts)

        sonar_section = ""
        if sonar and "error" not in sonar:
            m = sonar.get("measures", {})
            sonar_section = f"""
## SonarCloud Static Analysis (real data from sonarcloud.io)
- Quality Gate: {sonar.get('quality_gate', {}).get('status', 'UNKNOWN')}
- Bugs: {m.get('bugs', 'N/A')}
- Vulnerabilities: {m.get('vulnerabilities', 'N/A')}
- Security Hotspots: {m.get('security_hotspots', 'N/A')}
- Code Smells: {m.get('code_smells', 'N/A')}
- Coverage: {m.get('coverage', 'N/A')}%
- Duplication: {m.get('duplication_pct', 'N/A')}%
- Technical Debt: {m.get('technical_debt', 'N/A')}
- Lines of Code: {m.get('ncloc', 'N/A')}
- Reliability Rating: {m.get('reliability_rating', 'N/A')}
- Security Rating: {m.get('security_rating', 'N/A')}
- Maintainability: {m.get('sqale_rating', 'N/A')}

Top Issues (Bugs & Vulnerabilities):
{json.dumps(sonar.get('issues', [])[:10], indent=2)}

Use this data to enrich your technical_debt and owasp_findings analysis.
"""

        return f"""
Analyze this application codebase for cloud migration readiness to Azure.

## Migration Context
- Source Cloud: {source_cloud}
- Target Cloud: {target_cloud}
- Project: {context.get('project_name')}

## Pre-Scan Results (from static analysis tools)
{json.dumps(scan_summary, indent=2)}
{sonar_section}
## Raw Artifacts
{self._format_artifacts(artifacts)}

## Analysis Required
Perform a complete code analysis covering ALL of the following:

1. **Technology Inventory** — languages, frameworks, versions
2. **Cloud Provider Coupling** — SDK usage, hard-coded cloud resources, coupling score
3. **Architecture Patterns** — monolith/microservices/serverless/event-driven
4. **Technical Debt & Code Quality** — incorporate SonarCloud data above if present
5. **12-Factor App Compliance** — score ALL 12 factors (PASS/PARTIAL/FAIL)
6. **CNCF Cloud Native Readiness** — container quality, health probes, observability, GitOps
7. **OWASP Top 10 (2021)** — evaluate ALL 10 categories against this codebase
8. **SOLID Principles** — assess each principle (APPLIED/PARTIAL/VIOLATED/N/A)
9. **Migration Impact** — refactoring effort, SDK swap list, breaking changes

Return a comprehensive CodeAnalysisReport as JSON.
The JSON MUST include: technology_inventory, cloud_coupling, architecture_patterns,
technical_debt, containerization_readiness, migration_impact, twelve_factor,
owasp_findings, solid_assessment, coupling_score, summary.
"""

    def _pre_scan_artifacts(self, artifacts: list[dict[str, Any]]) -> dict[str, Any]:
        if not artifacts:
            return {"message": "No code artifacts provided"}
        scanner = CodeScanner()
        detected_languages: set[str] = set()
        detected_frameworks: set[str] = set()
        cloud_sdks: list[str] = []
        for artifact in artifacts:
            content = artifact.get("content", "")
            filename = artifact.get("filename", "")
            lang = scanner.detect_language(filename)
            if lang:
                detected_languages.add(lang)
            frameworks = scanner.detect_frameworks(content, filename)
            detected_frameworks.update(frameworks)
            sdks = scanner.detect_cloud_sdks(content)
            cloud_sdks.extend(sdks)
        return {
            "file_count": len(artifacts),
            "detected_languages": list(detected_languages),
            "detected_frameworks": list(detected_frameworks),
            "cloud_sdk_references": list(set(cloud_sdks)),
        }

    def _format_artifacts(self, artifacts: list[dict[str, Any]]) -> str:
        if not artifacts:
            return "No code artifacts provided."
        formatted = []
        for artifact in artifacts[:20]:
            filename = artifact.get("filename", "unknown")
            content = artifact.get("content", "")
            if len(content) > 3000:
                content = content[:3000] + "\n... [truncated]"
            formatted.append(f"### {filename}\n```\n{content}\n```")
        if len(artifacts) > 20:
            formatted.append(f"\n... and {len(artifacts) - 20} more files")
        return "\n\n".join(formatted)

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            if isinstance(data, list):
                data = {"findings": data, "raw": data}
            return {
                "technology_inventory": data.get("technology_inventory", {}),
                "cloud_coupling":       data.get("cloud_coupling", {}),
                "architecture_patterns": data.get("architecture_patterns", {}),
                "technical_debt":       data.get("technical_debt", {}),
                "containerization_readiness": data.get("containerization_readiness", {}),
                "migration_impact":     data.get("migration_impact", {}),
                "twelve_factor":        data.get("twelve_factor", []),
                "owasp_findings":       data.get("owasp_findings", []),
                "solid_assessment":     data.get("solid_assessment", {}),
                "summary":              data.get("summary", ""),
                "coupling_score": (
                    data.get("coupling_score")
                    or (data.get("cloud_coupling") or {}).get("coupling_level")
                    or (data.get("cloud_coupling") or {}).get("coupling_score")
                    or "UNKNOWN"
                ),
                "raw": data,
            }
        except json.JSONDecodeError:
            logger.warning("[%s] Could not parse JSON response", self.agent_name)
            return {"raw_text": raw_response, "parse_error": True}
