"""
Migration Planner Agent — produces a detailed, phased migration plan
following Microsoft CAF Migration methodology (6Rs + Wave Planning).
"""
import json
import logging
from typing import Any


from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class MigrationPlannerAgent(BaseAgent):
    """Produces phased migration plans with service mapping and risk assessment."""

    @property
    def agent_name(self) -> str:
        return "migration_planner"

    def get_tools(self) -> list:
        # File search allows the agent to query the migration patterns knowledge base
        return [FileSearchTool()]

    def build_user_message(self, context: dict[str, Any]) -> str:
        infra_results = context.get("infra_analyzer_results", {})
        code_results = context.get("code_analyzer_results", {})
        cost_results = context.get("cost_optimizer_results", {})
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")

        service_mapping = infra_results.get("service_mapping", [])
        arch_pattern = code_results.get("architecture_patterns", {}).get("type", "unknown")
        coupling_score = code_results.get("coupling_score", "UNKNOWN")

        return f"""
Create a detailed migration plan for this workload.

## Migration Context
- Project: {context.get('project_name')}
- Source Cloud: {source_cloud} → Target Cloud: {target_cloud}
- Architecture Pattern: {arch_pattern}
- Cloud Coupling Score: {coupling_score}

## Infrastructure Service Mapping ({len(service_mapping)} services)
{json.dumps(service_mapping[:15], indent=2)}
{"... and more services" if len(service_mapping) > 15 else ""}

## Application Characteristics
- Migration Impact per Component:
{json.dumps(code_results.get('migration_impact', {}), indent=2)}

## Cost Context
- Estimated Monthly Savings on Azure: ${cost_results.get('total_savings_summary', {}).get('total_annual_savings_usd', 0) / 12:.0f}

## Required Output

### 1. Migration Strategy Selection (per workload)
Apply the 6Rs strategy to each workload:
- Rehost / Replatform / Refactor / Repurchase / Retire / Retain
- Justify each choice

### 2. Landing Zone Design
- Azure Landing Zone requirements
- Networking topology for target
- Identity and access model (Entra ID)
- Governance and policy framework

### 3. Wave Planning
Organize workloads into migration waves:
- Wave 0: Foundation (networking, identity, monitoring)
- Wave 1: Low-complexity workloads
- Wave 2: Stateful and database workloads
- Wave 3: Complex/critical workloads

Per wave:
{{
  "wave": <number>,
  "name": "<wave name>",
  "workloads": ["<workload>"],
  "duration_weeks": <number>,
  "team_required": "<skills needed>",
  "prerequisites": ["<prereq>"],
  "success_criteria": ["<KPI>"],
  "rollback_plan": "<approach>"
}}

### 4. Risk Register
For each risk:
{{
  "risk_id": "RISK-001",
  "category": "technical|business|operational",
  "description": "<risk>",
  "probability": "low|medium|high",
  "impact": "low|medium|high",
  "risk_score": "low|medium|high|critical",
  "mitigation": "<specific mitigation action>",
  "contingency": "<if risk materializes>"
}}

### 5. Migration Tools & Accelerators
Recommend appropriate Azure migration tools:
- Azure Migrate (server/database assessment)
- Azure Database Migration Service
- Azure Site Recovery (replication)
- AzCopy (data transfer)
- GitHub Actions / Azure DevOps (pipeline)

Return a complete MigrationPlan as JSON.
"""

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            return {
                "workload_strategies": data.get("workload_strategies", []),
                "landing_zone_requirements": data.get("landing_zone_requirements", {}),
                "migration_waves": data.get("migration_waves", []),
                "risk_register": data.get("risk_register", []),
                "migration_tools": data.get("migration_tools", []),
                "total_duration_weeks": data.get("total_duration_weeks", 0),
                "team_requirements": data.get("team_requirements", {}),
                "summary": data.get("summary", ""),
                "raw": data,
            }
        except json.JSONDecodeError:
            logger.warning(f"[{self.agent_name}] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}
