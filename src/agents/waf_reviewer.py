"""
WAF Reviewer Agent — scores architecture against the 5 Azure Well-Architected
Framework pillars and produces prioritized recommendations.
"""
import json
import logging
from typing import Any


from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

WAF_LEVEL_MAP = {
    1: "None",
    2: "Basic",
    3: "Standard",
    4: "Advanced",
    5: "Optimized",
}


class WafReviewerAgent(BaseAgent):

    @property
    def agent_name(self) -> str:
        return "waf_reviewer"

    def get_tools(self) -> list:
        # Can search the WAF knowledge base (indexed in Azure AI Search)
        return [FileSearchTool()]

    def build_user_message(self, context: dict[str, Any]) -> str:
        infra_results = context.get("infra_analyzer_results", {})
        code_results = context.get("code_analyzer_results", {})
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")

        return f"""
Perform a complete Azure Well-Architected Framework review of this architecture.

## Context
- Project: {context.get('project_name')}
- Source Cloud: {source_cloud} → Target Cloud: {target_cloud}

## Architecture Evidence

### Infrastructure
- Resources: {infra_results.get('total_resources', 0)} total resources
- Security Posture: {json.dumps(infra_results.get('security_posture', {}), indent=2)}
- Networking: {json.dumps(infra_results.get('networking_topology', {}), indent=2)}
- Data Layer: {json.dumps(infra_results.get('data_layer', {}), indent=2)}

### Application
- Architecture Pattern: {code_results.get('architecture_patterns', {}).get('type', 'unknown')}
- Technical Debt Score: {code_results.get('technical_debt', {}).get('score', 'N/A')}/10
- 12-Factor Compliance: {code_results.get('containerization_readiness', {}).get('twelve_factor_score', 'N/A')}
- Observability: {code_results.get('technical_debt', {}).get('observability', 'unknown')}

## WAF Review Required
Score and review ALL 5 pillars:
1. Reliability
2. Security
3. Cost Optimization
4. Operational Excellence
5. Performance Efficiency

For each pillar provide:
- Score (1-5)
- Specific findings with severity
- Concrete recommendations with Azure service references

Per finding use this schema:
{{
  "id": "<PILLAR_ABBREV>-NNN",
  "severity": "critical|high|medium|low",
  "finding": "<what is wrong or missing>",
  "evidence": "<specific evidence from the analysis>",
  "recommendation": "<specific action to take>",
  "azure_service": "<Azure service that addresses this>",
  "implementation_guide": "<brief how-to>",
  "doc_link": "https://learn.microsoft.com/azure/well-architected/..."
}}

Also provide:
- overall_waf_score (average of 5 pillars, 1-5)
- overall_waf_level (None/Basic/Standard/Advanced/Optimized)
- top_5_priorities (finding IDs to address first)
- quick_wins (actions completable in < 1 day)
- waf_assessment_url suggestion for the Azure WAF Assessment tool

Return a complete WAFReviewReport as JSON.
"""

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            overall_score = data.get("overall_waf_score", 1)

            return {
                "overall_waf_score": overall_score,
                "overall_waf_level": WAF_LEVEL_MAP.get(round(overall_score), "Basic"),
                "pillars": {
                    "reliability": data.get("pillars", {}).get("reliability", {}),
                    "security": data.get("pillars", {}).get("security", {}),
                    "cost_optimization": data.get("pillars", {}).get("cost_optimization", {}),
                    "operational_excellence": data.get("pillars", {}).get("operational_excellence", {}),
                    "performance_efficiency": data.get("pillars", {}).get("performance_efficiency", {}),
                },
                "top_5_priorities": data.get("top_5_priorities", []),
                "quick_wins": data.get("quick_wins", []),
                "critical_finding_count": self._count_by_severity(data, "critical"),
                "high_finding_count": self._count_by_severity(data, "high"),
                "raw": data,
            }
        except json.JSONDecodeError:
            logger.warning(f"[{self.agent_name}] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}

    def _count_by_severity(self, data: dict, severity: str) -> int:
        count = 0
        for pillar_data in data.get("pillars", {}).values():
            if isinstance(pillar_data, dict):
                for finding in pillar_data.get("findings", []):
                    if finding.get("severity") == severity:
                        count += 1
        return count
