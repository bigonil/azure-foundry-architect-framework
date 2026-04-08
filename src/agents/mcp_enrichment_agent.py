"""
MCP Enrichment Agent — Phase 1.5 of the orchestration pipeline.

Runs AFTER code_analyzer and infra_analyzer (Phase 1) and BEFORE the Phase 2 specialist
agents. Uses Azure MCP Skills (azure-migrate, advisor, pricing, cloudarchitect, WAF, etc.)
and optionally Azure DevOps MCP to enrich the analysis with real Azure intelligence.

Only runs when at least one active MCP server is available.
Failures are non-fatal: the pipeline continues without enrichment data.
"""
import json
import logging
from typing import Any

from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

# Azure Skills available via the Azure MCP server
AZURE_SKILLS = [
    # Migration & Architecture
    "azuremigrate", "cloudarchitect", "get_azure_bestpractices",
    "azureterraformbestpractices", "wellarchitectedframework",
    "documentation", "bicepschema",
    # Pricing & Cost
    "pricing", "advisor",
    # Compute
    "compute", "aks", "appservice", "containerapps", "functionapp", "functions",
    # Databases
    "sql", "postgres", "mysql", "cosmos", "redis",
    # Messaging & Events
    "servicebus", "eventhubs", "eventgrid",
    # Storage & Security
    "storage", "fileshares", "keyvault", "role", "policy",
    # Observability
    "monitor", "applicationinsights", "grafana",
    # DevOps (if Azure DevOps MCP enabled)
    "repo_list_repos_by_project", "pipelines_get_builds",
]

# Azure DevOps skills available via the Azure DevOps MCP server
AZURE_DEVOPS_SKILLS = [
    "core_list_projects", "repo_list_repos_by_project", "repo_list_branches_by_repo",
    "repo_list_pull_requests_by_repo_or_project", "pipelines_get_builds",
    "pipelines_list_runs", "pipelines_get_build_status",
    "wit_my_work_items", "wit_list_backlogs", "search_code",
]


class McpEnrichmentAgent(BaseAgent):
    """
    Enriches migration analysis with real Azure intelligence via MCP Skills.

    Phase 1.5: runs after code_analyzer + infra_analyzer, before Phase 2 agents.
    Requires at least one active Azure MCP server. Gracefully skipped otherwise.
    """

    @property
    def agent_name(self) -> str:
        return "mcp_enrichment"

    def get_tools(self) -> list:
        return []  # MCP servers handle tool exposure, not Foundry tools

    def build_user_message(self, context: dict[str, Any]) -> str:
        code_results = context.get("code_analyzer_results", {})
        infra_results = context.get("infra_analyzer_results", {})
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")
        project_name = context.get("project_name", "")
        devops_org = context.get("azure_devops_org", "")

        # Summarise what Phase 1 found — gives Claude the context to call the right tools
        tech_inventory = code_results.get("technology_inventory", {})
        arch_patterns = code_results.get("architecture_patterns", {})
        coupling = code_results.get("cloud_coupling", {})
        coupling_score = code_results.get("coupling_score", "UNKNOWN")

        resource_inventory = infra_results.get("resource_inventory", [])
        service_mapping = infra_results.get("service_mapping", [])
        total_resources = infra_results.get("total_resources", len(resource_inventory))

        # Build a compact summary to focus the Azure Skills calls
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
            devops_section = f"\n## Azure DevOps Context\nOrganization: {devops_org}\n"
            devops_section += "If Azure DevOps MCP tools are available, call:\n"
            devops_section += "- core_list_projects to list migration-related projects\n"
            devops_section += "- repo_list_repos_by_project to understand repo structure\n"
            devops_section += "- pipelines_get_builds to assess CI/CD maturity\n"
            devops_section += "- wit_list_backlogs to identify existing migration work items\n"

        return f"""
Enrich the following cloud migration analysis using ALL available Azure MCP tools and Skills.

## Phase 1 Analysis Summary
{json.dumps(phase1_summary, indent=2)}

## Your Task
1. Call **azuremigrate** to get migration readiness for this workload
2. Call **pricing** to get actual Azure pricing for the target services identified above
3. Call **advisor** to get Azure Advisor recommendations for the migration scenario
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
Return a comprehensive JSON object:
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
        except json.JSONDecodeError:
            logger.warning("[mcp_enrichment] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}
