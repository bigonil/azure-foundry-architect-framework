"""
Orchestrator Agent — coordinates all specialist agents and synthesizes the final report.
Uses Semantic Kernel for multi-agent orchestration with parallel execution support.
"""
import asyncio
import json
import logging
import uuid
from typing import Any

from azure.ai.projects.models import FileSearchTool, FunctionTool, ToolDefinition

from src.agents.base_agent import AgentResult, BaseAgent
from src.agents.code_analyzer import CodeAnalyzerAgent
from src.agents.cost_optimizer import CostOptimizerAgent
from src.agents.gap_analyzer import GapAnalyzerAgent
from src.agents.infra_analyzer import InfraAnalyzerAgent
from src.agents.migration_planner import MigrationPlannerAgent
from src.agents.quality_analyzer import QualityAnalyzerAgent
from src.agents.waf_reviewer import WafReviewerAgent

logger = logging.getLogger(__name__)

# Registry of all specialist agents
AGENT_REGISTRY = {
    "code_analyzer": CodeAnalyzerAgent,
    "infra_analyzer": InfraAnalyzerAgent,
    "cost_optimizer": CostOptimizerAgent,
    "migration_planner": MigrationPlannerAgent,
    "gap_analyzer": GapAnalyzerAgent,
    "waf_reviewer": WafReviewerAgent,
    "quality_analyzer": QualityAnalyzerAgent,
}

# Phase 1: Sequential (produce inputs for Phase 2)
PHASE_1_AGENTS = ["code_analyzer", "infra_analyzer"]

# Phase 2: Parallel (use Phase 1 outputs)
PHASE_2_AGENTS = ["cost_optimizer", "migration_planner", "gap_analyzer", "waf_reviewer", "quality_analyzer"]


class AnalysisRequest:
    """Represents a full architectural analysis request."""

    def __init__(
        self,
        project_name: str,
        source_cloud: str,
        target_cloud: str,
        analysis_types: list[str],
        code_artifacts: list[dict[str, Any]] | None = None,
        iac_artifacts: list[dict[str, Any]] | None = None,
        current_monthly_cost_usd: float | None = None,
        additional_context: str = "",
    ):
        self.session_id = str(uuid.uuid4())
        self.project_name = project_name
        self.source_cloud = source_cloud  # aws | azure | gcp | on-premises | hybrid
        self.target_cloud = target_cloud  # azure (primary target)
        self.analysis_types = analysis_types  # all | code | infra | cost | migration | gap | waf
        self.code_artifacts = code_artifacts or []
        self.iac_artifacts = iac_artifacts or []
        self.current_monthly_cost_usd = current_monthly_cost_usd
        self.additional_context = additional_context

    def to_context(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "project_name": self.project_name,
            "source_cloud": self.source_cloud,
            "target_cloud": self.target_cloud,
            "analysis_types": self.analysis_types,
            "code_artifacts": self.code_artifacts,
            "iac_artifacts": self.iac_artifacts,
            "current_monthly_cost_usd": self.current_monthly_cost_usd,
            "additional_context": self.additional_context,
        }


class OrchestratorAgent(BaseAgent):
    """
    Master orchestrator that coordinates all specialist agents.
    Implements a phased execution strategy:
    - Phase 1: Code + Infrastructure analysis (sequential, produce shared context)
    - Phase 2: Cost, Migration, GAP, WAF analysis (parallel, consume Phase 1 results)
    - Phase 3: Final report synthesis
    """

    @property
    def agent_name(self) -> str:
        return "orchestrator"

    def get_tools(self) -> list[ToolDefinition]:
        return []  # Orchestrator uses sub-agents, not direct tools

    def build_user_message(self, context: dict[str, Any]) -> str:
        return f"""
Analyze this architecture request and create an execution plan:

Project: {context.get('project_name')}
Source Cloud: {context.get('source_cloud')}
Target Cloud: {context.get('target_cloud')}
Analysis Types: {', '.join(context.get('analysis_types', ['all']))}
Additional Context: {context.get('additional_context', 'None')}

Code Artifacts: {len(context.get('code_artifacts', []))} files
IaC Artifacts: {len(context.get('iac_artifacts', []))} files
Current Monthly Cost: ${context.get('current_monthly_cost_usd', 'Unknown')}

Return the orchestration plan as JSON.
"""

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            return json.loads(raw_response)
        except json.JSONDecodeError:
            return {"raw": raw_response}

    def _determine_agents_to_run(self, request: AnalysisRequest) -> tuple[list[str], list[str]]:
        """Determine which phase-1 and phase-2 agents to run based on analysis_types."""
        if "all" in request.analysis_types:
            return PHASE_1_AGENTS, PHASE_2_AGENTS

        phase1 = [a for a in PHASE_1_AGENTS if a in request.analysis_types]
        phase2 = [a for a in PHASE_2_AGENTS if a in request.analysis_types]

        # If phase-2 agents are requested without phase-1, still run phase-1 for context
        if phase2 and not phase1:
            phase1 = PHASE_1_AGENTS

        return phase1, phase2

    async def analyze(self, request: AnalysisRequest) -> "AnalysisReport":
        """Main entry point — runs all agents and returns the final report."""
        logger.info(
            f"[Orchestrator] Starting analysis session {request.session_id} "
            f"for project '{request.project_name}'"
        )

        context = request.to_context()
        phase1_agents, phase2_agents = self._determine_agents_to_run(request)
        all_results: dict[str, AgentResult] = {}

        # ── Phase 1: Sequential analysis ──────────────────────────────────────
        logger.info(f"[Orchestrator] Phase 1: Running {phase1_agents}")
        for agent_name in phase1_agents:
            agent = AGENT_REGISTRY[agent_name](use_foundry_mode=self.use_foundry_mode)
            result = await agent.run(context, session_id=request.session_id)
            all_results[agent_name] = result

            # Enrich context with Phase 1 results for Phase 2 agents
            if result.status == "success":
                context[f"{agent_name}_results"] = result.data

        # ── Phase 2: Parallel analysis ─────────────────────────────────────────
        if phase2_agents:
            logger.info(f"[Orchestrator] Phase 2: Running {phase2_agents} in parallel")
            semaphore = asyncio.Semaphore(self.settings.agent_parallel_limit)

            async def run_with_semaphore(agent_name: str) -> tuple[str, AgentResult]:
                async with semaphore:
                    agent = AGENT_REGISTRY[agent_name](use_foundry_mode=self.use_foundry_mode)
                    result = await agent.run(context, session_id=request.session_id)
                    return agent_name, result

            phase2_tasks = [run_with_semaphore(name) for name in phase2_agents]
            phase2_outcomes = await asyncio.gather(*phase2_tasks, return_exceptions=True)

            for outcome in phase2_outcomes:
                if isinstance(outcome, Exception):
                    logger.error(f"[Orchestrator] Phase 2 agent failed: {outcome}")
                else:
                    name, result = outcome
                    all_results[name] = result

        # ── Phase 3: Report synthesis ──────────────────────────────────────────
        logger.info("[Orchestrator] Phase 3: Synthesizing report")
        report = await self._synthesize_report(request, all_results)

        return report

    async def _synthesize_report(
        self, request: AnalysisRequest, results: dict[str, AgentResult]
    ) -> "AnalysisReport":
        """Synthesize all agent results into the final AnalysisReport."""
        client = self._get_openai_client()

        synthesis_prompt = self._build_synthesis_prompt(request, results)

        import asyncio as _asyncio
        loop = _asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=self.settings.azure_openai_deployment_gpt4o,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": synthesis_prompt},
                ],
                temperature=0.1,
                max_tokens=4096,
                response_format={"type": "json_object"},
            ),
        )

        synthesis_data = json.loads(response.choices[0].message.content or "{}")

        return AnalysisReport(
            session_id=request.session_id,
            project_name=request.project_name,
            source_cloud=request.source_cloud,
            target_cloud=request.target_cloud,
            agent_results=results,
            synthesis=synthesis_data,
        )

    def _build_synthesis_prompt(
        self, request: AnalysisRequest, results: dict[str, AgentResult]
    ) -> str:
        results_summary = {}
        for name, result in results.items():
            results_summary[name] = {
                "status": result.status,
                "duration_seconds": result.duration_seconds,
                "data": result.data if result.status == "success" else {"error": result.error},
            }

        return f"""
Synthesize the following specialist agent analyses into a unified executive report.

Project: {request.project_name}
Source Cloud: {request.source_cloud}
Target Cloud: {request.target_cloud}

Agent Results:
{json.dumps(results_summary, indent=2)}

Produce a JSON report with:
{{
  "executive_summary": "<3-5 sentence summary for C-level audience>",
  "maturity_score": <1-5>,
  "key_findings": ["<top finding 1>", "<top finding 2>", ...],
  "critical_risks": ["<risk 1>", ...],
  "recommended_strategy": "<rehost|replatform|refactor|hybrid — with rationale>",
  "estimated_migration_duration_weeks": <number>,
  "estimated_cost_savings_monthly_usd": <number>,
  "top_10_actions": [
    {{
      "priority": 1,
      "action": "<specific action>",
      "owner": "cloud_team|dev_team|security_team|management",
      "timeline": "immediate|30_days|90_days|6_months",
      "effort": "hours|days|weeks|months",
      "impact": "critical|high|medium|low"
    }}
  ],
  "roadmap_phases": [
    {{
      "phase": 1,
      "name": "<phase name>",
      "duration_weeks": <number>,
      "objectives": ["<objective>"],
      "key_milestones": ["<milestone>"]
    }}
  ]
}}
"""


class AnalysisReport:
    """Final output of the orchestration pipeline."""

    def __init__(
        self,
        session_id: str,
        project_name: str,
        source_cloud: str,
        target_cloud: str,
        agent_results: dict[str, AgentResult],
        synthesis: dict[str, Any],
    ):
        self.session_id = session_id
        self.project_name = project_name
        self.source_cloud = source_cloud
        self.target_cloud = target_cloud
        self.agent_results = agent_results
        self.synthesis = synthesis

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "project_name": self.project_name,
            "source_cloud": self.source_cloud,
            "target_cloud": self.target_cloud,
            "synthesis": self.synthesis,
            "agent_results": {
                name: result.to_dict() for name, result in self.agent_results.items()
            },
        }
