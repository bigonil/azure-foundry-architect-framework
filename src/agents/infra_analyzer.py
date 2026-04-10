"""
Infrastructure Analyzer Agent — parses IaC artifacts to produce a complete
infrastructure inventory, security posture, and service mapping.

Opzione A: Claude analysis guided by CIS Benchmark, Azure WAF, Azure CAF (in prompt).
Opzione B: After static analysis, calls Azure MCP tools (wellarchitectedframework,
           azureterraformbestpractices, service-specific tools) to enrich results
           with live Azure-specific infrastructure guidance.
"""
import json
import logging
from typing import Any

from src.agents.base_agent import BaseAgent
from src.tools.infra_parser import InfraParser

logger = logging.getLogger(__name__)

# Base MCP tool patterns always called for infra analysis
_INFRA_MCP_BASE_PATTERNS = [
    "wellarchitectedframework",
    "get_azure_bestpractices",
]
# IaC-format-specific patterns
_TERRAFORM_PATTERNS = ["azureterraformbestpractices"]
_BICEP_PATTERNS     = ["bicepschema"]

# Mapping: source service keywords → Azure MCP tool pattern
_SERVICE_TO_MCP: dict[str, str] = {
    "kubernetes": "aks",
    "eks":        "aks",
    "aks":        "aks",
    "container":  "containerapps",
    "webapp":     "appservice",
    "function":   "functionapp",
    "sql":        "sql",
    "postgres":   "postgres",
    "mysql":      "mysql",
    "cosmos":     "cosmos",
    "redis":      "redis",
    "storage":    "storage",
    "blob":       "storage",
    "keyvault":   "keyvault",
    "servicebus": "servicebus",
    "eventhub":   "eventhubs",
}


class InfraAnalyzerAgent(BaseAgent):
    """Analyzes IaC artifacts (Terraform, Bicep, ARM, K8s, CloudFormation).

    Phase 1 agent. Run order:
    1. Claude static analysis (Opzione A — CIS/WAF/CAF in prompt)
    2. Azure MCP enrichment (Opzione B — if MCP servers active)
       → calls wellarchitectedframework + IaC-specific + service-specific tools
       → synthesizes raw MCP outputs into structured `mcp_infra_guidance` via Haiku
    """

    @property
    def agent_name(self) -> str:
        return "infra_analyzer"

    def get_tools(self) -> list:
        if self.settings.llm_provider == "azure":
            from azure.ai.projects.models import CodeInterpreterTool  # noqa: PLC0415
            return [CodeInterpreterTool()]
        return []

    # ── Override run() to add MCP enrichment ─────────────────────────────────

    async def run(
        self,
        context: dict[str, Any],
        session_id: str | None = None,
        mcp_servers: list[dict[str, Any]] | None = None,
    ):
        """Run Claude IaC analysis, then MCP enrich if servers are active."""
        # ── Step 1: Claude static analysis (Opzione A) ────────────────────────
        result = await super().run(context, session_id, mcp_servers=None)

        # ── Step 2: Azure MCP enrichment (Opzione B) ─────────────────────────
        if mcp_servers and self.settings.llm_provider == "anthropic":
            mcp_guidance = await self._enrich_with_mcp(
                mcp_servers=mcp_servers,
                analysis_data=result.data,
                iac_artifacts=context.get("iac_artifacts", []),
            )
            if mcp_guidance:
                result.data["mcp_infra_guidance"] = mcp_guidance
                logger.info(
                    "[infra_analyzer] MCP guidance added — tools called: %s",
                    mcp_guidance.get("tools_called", []),
                )

        return result

    # ── MCP enrichment (Opzione B) ────────────────────────────────────────────

    async def _enrich_with_mcp(
        self,
        mcp_servers: list[dict[str, Any]],
        analysis_data: dict[str, Any],
        iac_artifacts: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Call Azure MCP tools relevant to detected IaC format and services,
        then synthesize into structured infrastructure migration guidance.
        """
        from src.agents.mcp_helpers import targeted_mcp_call, synthesize_mcp_guidance

        patterns = list(_INFRA_MCP_BASE_PATTERNS)

        # Add IaC-format-specific patterns
        iac_types = self._detect_iac_types(iac_artifacts)
        if "terraform" in iac_types:
            patterns += _TERRAFORM_PATTERNS
        if "bicep" in iac_types or "arm" in iac_types:
            patterns += _BICEP_PATTERNS

        # Add service-specific patterns based on detected resources
        service_patterns = self._detect_service_patterns(analysis_data)
        patterns += service_patterns

        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_patterns: list[str] = []
        for p in patterns:
            if p not in seen:
                seen.add(p)
                unique_patterns.append(p)

        logger.info("[infra_analyzer] MCP enrichment — calling patterns: %s", unique_patterns)

        try:
            mcp_results = await targeted_mcp_call(
                mcp_servers=mcp_servers,
                tool_patterns=unique_patterns,
                max_calls=6,
            )
        except Exception as exc:
            logger.warning("[infra_analyzer] targeted_mcp_call failed: %s", exc)
            return {}

        if not mcp_results:
            logger.info("[infra_analyzer] No MCP results — skipping synthesis")
            return {}

        # Build analysis summary for synthesis
        resource_count = analysis_data.get("total_resources", 0)
        svc_map = analysis_data.get("service_mapping", [])
        services = [
            s.get("source_service", "") for s in svc_map
            if isinstance(s, dict) and s.get("source_service")
        ]
        critical = analysis_data.get("critical_findings", [])
        summary = (
            f"IaC types: {', '.join(iac_types) or 'unknown'}. "
            f"Total resources: {resource_count}. "
            f"Source services: {', '.join(services[:10]) or 'unknown'}. "
            f"Critical findings: {len(critical)}."
        )

        try:
            guidance = await synthesize_mcp_guidance(
                mcp_results=mcp_results,
                analysis_summary=summary,
                guidance_type="infra",
                anthropic_api_key=self.settings.anthropic_api_key,
                model=self.settings.anthropic_model_mcp,
            )
        except Exception as exc:
            logger.warning("[infra_analyzer] MCP synthesis failed: %s", exc)
            return {}

        return guidance

    def _detect_iac_types(self, iac_artifacts: list[dict[str, Any]]) -> list[str]:
        """Return lowercase IaC type names detected in the artifacts."""
        from src.tools.infra_parser import InfraParser
        parser = InfraParser()
        types: set[str] = set()
        for artifact in iac_artifacts:
            iac_type = parser.detect_iac_type(
                artifact.get("filename", ""),
                artifact.get("content", ""),
            )
            if iac_type:
                types.add(iac_type.lower())
        return list(types)

    def _detect_service_patterns(self, analysis_data: dict[str, Any]) -> list[str]:
        """Map detected source services to Azure MCP tool patterns (max 4)."""
        svc_map  = analysis_data.get("service_mapping", [])
        resource_inv = analysis_data.get("resource_inventory", [])

        # Collect source service names from both service_mapping and resource_inventory
        raw_names: list[str] = []
        for s in svc_map:
            if isinstance(s, dict):
                raw_names.append((s.get("source_service") or "").lower())
            elif isinstance(s, str):
                raw_names.append(s.lower())
        for r in resource_inv:
            if isinstance(r, dict):
                raw_names.append((r.get("type") or r.get("source_service") or "").lower())
            elif isinstance(r, str):
                raw_names.append(r.lower())

        matched: list[str] = []
        for name in raw_names:
            for keyword, pattern in _SERVICE_TO_MCP.items():
                if keyword in name and pattern not in matched:
                    matched.append(pattern)
            if len(matched) >= 4:
                break

        return matched

    # ── build_user_message ────────────────────────────────────────────────────

    def build_user_message(self, context: dict[str, Any]) -> str:
        iac_artifacts = context.get("iac_artifacts", [])
        source_cloud  = context.get("source_cloud", "unknown")
        target_cloud  = context.get("target_cloud", "azure")
        pre_parse     = self._pre_parse_iac(iac_artifacts)

        return f"""
Analyze this infrastructure-as-code for cloud migration readiness to Azure.

## Migration Context
- Source Cloud: {source_cloud}
- Target Cloud: {target_cloud}
- Project: {context.get('project_name')}

## Pre-Parse Results (static IaC analysis)
{json.dumps(pre_parse, indent=2)}

## IaC Artifacts
{self._format_iac_artifacts(iac_artifacts)}

## Analysis Required
Perform a complete IaC analysis covering ALL of the following:

1. **Resource Inventory** — list all resources with type, size, region, configuration
2. **Networking Topology** — VPC/VNet structure, security groups, load balancers, DNS
3. **Security Posture** — CIS Azure Foundations Benchmark checks, encryption, IAM, secrets
4. **Azure Well-Architected Framework** — score all 5 pillars (Reliability, Security, Cost, OpEx, Perf)
5. **Azure Cloud Adoption Framework** — assess alignment to Landing Zone design areas
6. **Compute & Scaling** — VM sizes, auto-scaling, spot instances
7. **Data Layer** — databases, storage, backup policies
8. **Cost Indicators** — over-provisioned resources, optimization opportunities
9. **Service Mapping** — map each source-cloud service to its Azure equivalent

For the service mapping, use this format per resource:
{{
  "source_resource_id": "<id>",
  "source_service": "<AWS/GCP service>",
  "source_config": {{}},
  "azure_equivalent": "<Azure service name>",
  "azure_sku": "<recommended SKU>",
  "migration_complexity": "LOW|MEDIUM|HIGH",
  "feature_parity": "FULL|PARTIAL|NONE",
  "migration_notes": "<specific concerns or actions needed>"
}}

Return a comprehensive InfraAnalysisReport as JSON.
The JSON MUST include: resource_inventory, networking_topology, security_posture,
waf_assessment (with 5 pillar scores), caf_assessment, cis_findings,
compute_scaling, data_layer, cost_indicators, service_mapping, critical_findings, summary.
"""

    def _pre_parse_iac(self, artifacts: list[dict[str, Any]]) -> dict[str, Any]:
        if not artifacts:
            return {"message": "No IaC artifacts provided"}
        parser = InfraParser()
        resources: list[Any] = []
        iac_types_detected: set[str] = set()
        for artifact in artifacts:
            filename = artifact.get("filename", "")
            content  = artifact.get("content", "")
            iac_type = parser.detect_iac_type(filename, content)
            if iac_type:
                iac_types_detected.add(iac_type)
            extracted = parser.extract_resources(content, iac_type)
            resources.extend(extracted)
        return {
            "iac_types_detected":  list(iac_types_detected),
            "resource_count":      len(resources),
            "resources_preview":   resources[:20],
        }

    def _format_iac_artifacts(self, artifacts: list[dict[str, Any]]) -> str:
        if not artifacts:
            return "No IaC artifacts provided."
        formatted = []
        for artifact in artifacts[:15]:
            filename = artifact.get("filename", "unknown")
            content  = artifact.get("content", "")
            if len(content) > 4000:
                content = content[:4000] + "\n... [truncated]"
            formatted.append(f"### {filename}\n```hcl\n{content}\n```")
        if len(artifacts) > 15:
            formatted.append(f"\n... and {len(artifacts) - 15} more files")
        return "\n\n".join(formatted)

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            if isinstance(data, list):
                data = {"resource_inventory": data}
            return {
                "resource_inventory":  data.get("resource_inventory", []),
                "networking_topology": data.get("networking_topology", {}),
                "security_posture":    data.get("security_posture", {}),
                "waf_assessment":      data.get("waf_assessment", {}),
                "caf_assessment":      data.get("caf_assessment", {}),
                "cis_findings":        data.get("cis_findings", []),
                "compute_scaling":     data.get("compute_scaling", {}),
                "data_layer":          data.get("data_layer", {}),
                "cost_indicators":     data.get("cost_indicators", []),
                "service_mapping":     data.get("service_mapping", []),
                "summary":             data.get("summary", ""),
                "total_resources":     data.get("total_resources", 0),
                "critical_findings":   data.get("critical_findings", []),
                "raw": data,
            }
        except (json.JSONDecodeError, AttributeError, TypeError):
            logger.warning("[%s] Could not parse JSON response", self.agent_name)
            return {"raw_text": raw_response, "parse_error": True}
