"""
Infrastructure Analyzer Agent — parses IaC artifacts to produce a complete
infrastructure inventory, security posture, and service mapping.
"""
import json
import logging
from typing import Any

from azure.ai.projects.models import CodeInterpreterTool, ToolDefinition

from src.agents.base_agent import BaseAgent
from src.tools.infra_parser import InfraParser

logger = logging.getLogger(__name__)


class InfraAnalyzerAgent(BaseAgent):
    """Analyzes IaC artifacts (Terraform, Bicep, ARM, K8s, CloudFormation)."""

    @property
    def agent_name(self) -> str:
        return "infra_analyzer"

    def get_tools(self) -> list[ToolDefinition]:
        return [CodeInterpreterTool()]

    def build_user_message(self, context: dict[str, Any]) -> str:
        iac_artifacts = context.get("iac_artifacts", [])
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")

        # Pre-parse IaC with local tools
        pre_parse = self._pre_parse_iac(iac_artifacts)

        return f"""
Analyze this infrastructure-as-code for cloud migration readiness.

## Migration Context
- Source Cloud: {source_cloud}
- Target Cloud: {target_cloud}
- Project: {context.get('project_name')}

## Pre-Parse Results (static IaC analysis)
{json.dumps(pre_parse, indent=2)}

## IaC Artifacts
{self._format_iac_artifacts(iac_artifacts)}

## Analysis Required
1. **Resource Inventory**: List all resources with type, size, region, configuration
2. **Networking Topology**: VPC/VNet structure, security groups, load balancers, DNS
3. **Security Posture**: Encryption, IAM, secrets management, compliance gaps
4. **Compute & Scaling**: VM sizes, auto-scaling, spot instances
5. **Data Layer**: Databases, storage, backup policies
6. **Cost Indicators**: Over-provisioned resources, optimization opportunities
7. **Service Mapping**: Map each source-cloud service to its Azure equivalent

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
"""

    def _pre_parse_iac(self, artifacts: list[dict[str, Any]]) -> dict[str, Any]:
        """Use local parser for initial resource extraction."""
        if not artifacts:
            return {"message": "No IaC artifacts provided"}

        parser = InfraParser()
        resources = []
        iac_types_detected = set()

        for artifact in artifacts:
            filename = artifact.get("filename", "")
            content = artifact.get("content", "")
            iac_type = parser.detect_iac_type(filename, content)
            if iac_type:
                iac_types_detected.add(iac_type)
            extracted = parser.extract_resources(content, iac_type)
            resources.extend(extracted)

        return {
            "iac_types_detected": list(iac_types_detected),
            "resource_count": len(resources),
            "resources_preview": resources[:20],
        }

    def _format_iac_artifacts(self, artifacts: list[dict[str, Any]]) -> str:
        if not artifacts:
            return "No IaC artifacts provided."

        formatted = []
        for artifact in artifacts[:15]:
            filename = artifact.get("filename", "unknown")
            content = artifact.get("content", "")
            if len(content) > 4000:
                content = content[:4000] + "\n... [truncated]"
            formatted.append(f"### {filename}\n```hcl\n{content}\n```")

        if len(artifacts) > 15:
            formatted.append(f"\n... and {len(artifacts) - 15} more files")

        return "\n\n".join(formatted)

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            return {
                "resource_inventory": data.get("resource_inventory", []),
                "networking_topology": data.get("networking_topology", {}),
                "security_posture": data.get("security_posture", {}),
                "compute_scaling": data.get("compute_scaling", {}),
                "data_layer": data.get("data_layer", {}),
                "cost_indicators": data.get("cost_indicators", []),
                "service_mapping": data.get("service_mapping", []),
                "summary": data.get("summary", ""),
                "total_resources": data.get("total_resources", 0),
                "critical_findings": data.get("critical_findings", []),
                "raw": data,
            }
        except json.JSONDecodeError:
            logger.warning(f"[{self.agent_name}] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}
