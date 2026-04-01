"""
Cost Optimizer Agent — estimates current costs and identifies savings opportunities
following WAF Cost Optimization pillar and Microsoft FinOps best practices.
"""
import json
import logging
from typing import Any


from src.agents.base_agent import BaseAgent
from src.tools.pricing_calculator import PricingCalculator

logger = logging.getLogger(__name__)


class CostOptimizerAgent(BaseAgent):
    """Analyzes costs and produces optimization recommendations."""

    @property
    def agent_name(self) -> str:
        return "cost_optimizer"

    def get_tools(self) -> list:
        # Expose Azure Pricing API as a tool
        return [
            FunctionTool(
                definitions=[
                    {
                        "type": "function",
                        "function": {
                            "name": "get_azure_pricing",
                            "description": "Get Azure retail pricing for a specific service",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "service_name": {"type": "string"},
                                    "sku_name": {"type": "string"},
                                    "region": {"type": "string"},
                                },
                                "required": ["service_name"],
                            },
                        },
                    }
                ]
            )
        ]

    def build_user_message(self, context: dict[str, Any]) -> str:
        infra_results = context.get("infra_analyzer_results", {})
        code_results = context.get("code_analyzer_results", {})
        current_cost = context.get("current_monthly_cost_usd")
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")

        # Pre-calculate some cost estimates
        service_mapping = infra_results.get("service_mapping", [])
        azure_estimates = self._estimate_azure_costs(service_mapping)

        return f"""
Perform a comprehensive cost analysis and optimization review.

## Context
- Project: {context.get('project_name')}
- Source Cloud: {source_cloud}
- Target Cloud: {target_cloud}
- Current Monthly Cost (reported): ${current_cost or 'Not provided'}

## Infrastructure Findings (from infra_analyzer)
- Total Resources: {infra_results.get('total_resources', 'N/A')}
- Service Mapping: {len(service_mapping)} services mapped
- Cost Indicators: {json.dumps(infra_results.get('cost_indicators', []), indent=2)}

## Application Architecture (from code_analyzer)
- Architecture Pattern: {code_results.get('architecture_patterns', {}).get('type', 'N/A')}
- Containerization Readiness: {code_results.get('containerization_readiness', {}).get('score', 'N/A')}

## Azure Cost Estimates (pre-calculated)
{json.dumps(azure_estimates, indent=2)}

## Required Analysis
1. Estimate current monthly cost breakdown by category (compute, storage, network, database)
2. Estimate target Azure monthly cost (as-is migration vs optimized)
3. Identify TOP 10 cost optimization opportunities ranked by savings
4. Calculate ROI for optimization actions
5. Identify Azure Hybrid Benefit and Reserved Instance opportunities
6. Flag dev/test environments using production tier resources

For each optimization finding follow this exact schema:
{{
  "category": "compute|storage|network|database|licensing|architecture",
  "finding": "<description>",
  "current_monthly_cost_usd": <number>,
  "optimized_monthly_cost_usd": <number>,
  "monthly_savings_usd": <number>,
  "annual_savings_usd": <number>,
  "implementation_effort": "1 day|1 week|2 weeks|1 month|3 months",
  "risk": "low|medium|high",
  "priority": "immediate|short_term|long_term",
  "action": "<specific technical action>"
}}

Return a complete CostOptimizationReport as JSON including a total_savings_summary.
"""

    def _estimate_azure_costs(self, service_mapping: list[dict]) -> dict[str, Any]:
        """Pre-calculate rough Azure cost estimates using pricing calculator."""
        calculator = PricingCalculator()
        estimates = []
        total_monthly = 0.0

        for svc in service_mapping[:10]:  # Sample first 10 for pre-calc
            azure_service = svc.get("azure_equivalent", "")
            azure_sku = svc.get("azure_sku", "")
            if azure_service:
                monthly = calculator.estimate_monthly_cost(azure_service, azure_sku)
                estimates.append({
                    "service": azure_service,
                    "sku": azure_sku,
                    "estimated_monthly_usd": monthly,
                })
                total_monthly += monthly

        return {
            "sample_estimates": estimates,
            "estimated_total_monthly_usd": total_monthly,
            "note": "Rough estimates — final pricing depends on actual usage",
        }

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            return {
                "current_cost_breakdown": data.get("current_cost_breakdown", {}),
                "target_cost_estimate": data.get("target_cost_estimate", {}),
                "optimization_findings": data.get("optimization_findings", []),
                "total_savings_summary": data.get("total_savings_summary", {}),
                "hybrid_benefit_opportunities": data.get("hybrid_benefit_opportunities", []),
                "reserved_instance_recommendations": data.get("reserved_instance_recommendations", []),
                "roi_analysis": data.get("roi_analysis", {}),
                "raw": data,
            }
        except json.JSONDecodeError:
            logger.warning(f"[{self.agent_name}] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}
