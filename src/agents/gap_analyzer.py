"""
GAP Analyzer Agent — compares current state vs target state architecture
and produces a prioritized remediation roadmap.
"""
import json
import logging
from typing import Any


from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class GapAnalyzerAgent(BaseAgent):

    @property
    def agent_name(self) -> str:
        return "gap_analyzer"

    def get_tools(self) -> list:
        return []

    def build_user_message(self, context: dict[str, Any]) -> str:
        infra_results = context.get("infra_analyzer_results", {})
        code_results = context.get("code_analyzer_results", {})
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")

        security_posture = infra_results.get("security_posture", {})
        critical_findings = infra_results.get("critical_findings", [])
        tech_debt = code_results.get("technical_debt", {})
        containerization = code_results.get("containerization_readiness", {})

        return f"""
Perform a comprehensive GAP analysis between current state and target architecture.

## Analysis Context
- Project: {context.get('project_name')}
- Source: {source_cloud} → Target: {target_cloud}
- Additional Context: {context.get('additional_context', 'None')}

## Current State Assessment (from previous agents)

### Infrastructure
- Security Posture: {json.dumps(security_posture, indent=2)}
- Critical Findings: {json.dumps(critical_findings, indent=2)}
- Networking: {json.dumps(infra_results.get('networking_topology', {}), indent=2)}

### Application
- Technical Debt Score: {tech_debt.get('score', 'N/A')}/10
- Technical Debt Items: {json.dumps(tech_debt.get('items', []), indent=2)}
- Containerization Score: {containerization.get('score', 'N/A')}
- 12-Factor Compliance: {containerization.get('twelve_factor_score', 'N/A')}

## Target State (Azure Well-Architected)
The target state should achieve:
- WAF score ≥ 4/5 across all pillars
- Zero Trust security model
- Full IaC (no manual deployments)
- Automated CI/CD with gates
- Comprehensive observability (logs, metrics, traces)
- Multi-AZ deployment with defined RTO/RPO
- FinOps maturity level 3+

## GAP Analysis Required
Analyze gaps across ALL 7 dimensions:
1. Functional Gaps
2. Operational Gaps (CI/CD, monitoring, incident response)
3. Security & Compliance Gaps (GDPR, NIS2, ISO27001 if relevant)
4. Performance & Reliability Gaps
5. Developer Experience Gaps
6. Cost & FinOps Maturity Gaps
7. Skills & Organizational Gaps

For each gap use exactly this schema:
{{
  "id": "GAP-XXX",
  "dimension": "<dimension>",
  "title": "<short title>",
  "description": "<detailed description>",
  "current_state": "<evidence from analysis>",
  "target_state": "<what needs to exist>",
  "severity": "critical|high|medium|low",
  "effort": "days|weeks|months|quarters",
  "business_impact": "<revenue|cost|risk|compliance impact>",
  "recommended_action": "<specific technical action>",
  "azure_service_recommendation": "<Azure service if applicable>",
  "dependencies": ["GAP-XXX"]
}}

Also provide:
- current_state_maturity_score (1-5)
- target_state_maturity_score (always 4 or 5)
- overall_gap_percentage (0-100)
- remediation_roadmap with phase_1/2/3 groupings

Return a complete GAPAnalysisReport as JSON.
"""

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            gaps = data.get("gaps", [])
            critical_gaps = [g for g in gaps if g.get("severity") == "critical"]

            return {
                "current_state_maturity_score": data.get("current_state_maturity_score", 1),
                "target_state_maturity_score": data.get("target_state_maturity_score", 4),
                "overall_gap_percentage": data.get("overall_gap_percentage", 0),
                "gaps": gaps,
                "critical_gap_count": len(critical_gaps),
                "gaps_by_dimension": self._group_by_dimension(gaps),
                "remediation_roadmap": data.get("remediation_roadmap", {}),
                "summary": data.get("summary", ""),
                "raw": data,
            }
        except json.JSONDecodeError:
            logger.warning(f"[{self.agent_name}] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}

    def _group_by_dimension(self, gaps: list[dict]) -> dict[str, list]:
        grouped: dict[str, list] = {}
        for gap in gaps:
            dim = gap.get("dimension", "unknown")
            grouped.setdefault(dim, []).append(gap["id"])
        return grouped
