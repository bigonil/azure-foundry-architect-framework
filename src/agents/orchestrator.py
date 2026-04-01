"""
Orchestrator Agent — coordinates all specialist agents and synthesizes the final report.
Uses Semantic Kernel for multi-agent orchestration with parallel execution support.
"""
import asyncio
import json
import logging
import uuid
from typing import Any

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

    def get_tools(self) -> list:
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
        synthesis_prompt = self._build_synthesis_prompt(request, results)

        if self.settings.llm_provider == "anthropic":
            synthesis_data = await self._synthesize_anthropic(synthesis_prompt)
        else:
            synthesis_data = await self._synthesize_azure(synthesis_prompt)

        return AnalysisReport(
            session_id=request.session_id,
            project_name=request.project_name,
            source_cloud=request.source_cloud,
            target_cloud=request.target_cloud,
            agent_results=results,
            synthesis=synthesis_data,
        )

    async def _synthesize_anthropic(self, synthesis_prompt: str) -> dict[str, Any]:
        """Synthesize via Anthropic Claude claude-opus-4-6."""
        import anthropic  # lazy import

        client = anthropic.AsyncAnthropic(
            api_key=self.settings.anthropic_api_key or None
        )
        system = (
            self.system_prompt
            + "\n\nCRITICAL: Respond ONLY with valid JSON. No markdown, no code fences. "
            "Start directly with { and end with }."
        )
        response = await client.messages.create(
            model=self.settings.anthropic_model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": synthesis_prompt}],
        )
        raw = response.content[0].text
        clean = self._extract_json(raw)
        return json.loads(clean)

    async def _synthesize_azure(self, synthesis_prompt: str) -> dict[str, Any]:
        """Synthesize via Azure OpenAI GPT-4o."""
        client = self._get_openai_client()
        loop = asyncio.get_event_loop()
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
        return json.loads(response.choices[0].message.content or "{}")

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

        current_cost_eur = None
        if request.current_monthly_cost_usd:
            # Convert USD → EUR at ~0.93 rate
            current_cost_eur = round(request.current_monthly_cost_usd * 0.93, 0)

        cost_context = (
            f"Current monthly cost: €{current_cost_eur:,.0f} EUR"
            if current_cost_eur
            else "Current monthly cost: not provided"
        )

        return f"""
Synthesize the following specialist agent analyses into a unified executive report.

Project: {request.project_name}
Source Cloud: {request.source_cloud}
Target Cloud: {request.target_cloud}
{cost_context}

Agent Results:
{json.dumps(results_summary, indent=2)}

IMPORTANT CALCULATION GUIDELINES:

1. estimated_migration_duration_weeks — derive from actual agent findings:
   - Count total files/services/resources identified by code_analyzer and infra_analyzer
   - Simple (< 5 services, low coupling): 4–8 weeks
   - Medium (5–15 services, moderate coupling): 8–16 weeks
   - Complex (> 15 services, high coupling, legacy debt): 16–32 weeks
   - Add 2–4 weeks per critical risk identified
   - Base on the actual complexity found, not a generic estimate

2. estimated_cost_savings_monthly_usd — express in EUR (field name kept for compatibility):
   - If current cost is known, estimate Azure target cost based on:
     * Rehost: 15–25% savings (like-for-like Azure VMs)
     * Replatform: 25–40% savings (managed services)
     * Refactor: 35–55% savings (PaaS + right-sizing)
   - Savings = current_cost_eur × savings_percentage
   - If no current cost provided, derive from infra complexity (€500–€5000/month typical range)
   - This value MUST be in EUR (€), NOT USD

3. All monetary values in the response MUST be in EUR (€).

Produce a JSON report with:
{{
  "executive_summary": "<3-5 sentence summary for C-level audience, monetary values in EUR>",
  "maturity_score": <1.0-5.0, derived from code quality, coupling score, infra complexity>,
  "key_findings": ["<specific finding from agent data>", ...],
  "critical_risks": ["<specific risk identified by agents>", ...],
  "recommended_strategy": "<rehost|replatform|refactor|hybrid — with rationale based on coupling score and complexity>",
  "estimated_migration_duration_weeks": <integer, calculated as described above>,
  "estimated_cost_savings_monthly_usd": <number in EUR, calculated as described above>,
  "top_10_actions": [
    {{
      "priority": 1,
      "action": "<specific, actionable step derived from agent findings>",
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
      "objectives": ["<specific objective from agent data>"],
      "key_milestones": ["<measurable milestone>"]
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
