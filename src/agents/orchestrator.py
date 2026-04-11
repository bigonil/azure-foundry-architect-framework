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
from src.agents.mcp_enrichment_agent import McpEnrichmentAgent
from src.agents.migration_planner import MigrationPlannerAgent
from src.agents.quality_analyzer import QualityAnalyzerAgent
from src.agents.waf_reviewer import WafReviewerAgent
from src.cache.redis_cache import agent_cache_key, cache_get, cache_set

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
        mcp_servers: list[dict[str, Any]] | None = None,
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
        self.mcp_servers: list[dict[str, Any]] = mcp_servers or []

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
    - Phase 1:   Code + Infrastructure analysis (sequential, produce shared context)
    - Phase 1.5: MCP Enrichment (optional, runs when Azure MCP servers are active)
    - Phase 2:   Cost, Migration, GAP, WAF analysis (parallel, consume Phase 1+1.5 results)
    - Phase 3:   Final report synthesis
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

    def _build_mcp_servers(self, request: AnalysisRequest) -> list[dict[str, Any]]:
        """
        Build the final list of active MCP servers by merging:
        1. Pre-configured servers (internal Docker services, URLs from settings)
        2. Custom user-provided servers (from the request, with explicit URLs)

        Pre-configured servers: the request can toggle them on/off but cannot change their URL.
        Custom servers: passed as-is if they have a URL and are enabled.
        Only URL-type servers that are enabled and have a URL are returned.
        """
        final: list[dict[str, Any]] = []

        # Pre-configured servers — URL injected from settings
        for preset in self.settings.preconfigured_mcp_servers:
            # Check if the request carries a toggle override for this server
            override = next(
                (s for s in request.mcp_servers if s.get("id") == preset["id"]),
                None,
            )
            server = dict(preset)
            if override is not None:
                server["enabled"] = override.get("enabled", preset["enabled"])
            final.append(server)

        # Custom user-provided servers (not pre-configured)
        for s in request.mcp_servers:
            if not s.get("preconfigured", False) and s.get("url") and s.get("type") == "url":
                final.append(s)

        # Return only enabled URL-type servers with a valid URL
        active = [
            s for s in final
            if s.get("enabled") and s.get("url") and s.get("type") == "url"
        ]
        if active:
            logger.info(
                "[Orchestrator] Active MCP servers: %s",
                [s["name"] for s in active],
            )
        return active

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
        # Inject Azure DevOps org into context so McpEnrichmentAgent can reference it
        context["azure_devops_org"] = self.settings.azure_devops_org

        phase1_agents, phase2_agents = self._determine_agents_to_run(request)
        active_mcp = self._build_mcp_servers(request)
        all_results: dict[str, AgentResult] = {}

        agent_ttl = self.settings.cache_agent_ttl_hours * 3600

        # ── Phase 1: Sequential analysis ──────────────────────────────────────
        # active_mcp is passed to Phase 1 agents so code_analyzer and infra_analyzer
        # can enrich their results with targeted Azure MCP calls (Opzione B).
        # Cache keys include mcp presence so MCP-enriched and non-MCP results are stored separately.
        logger.info("[Orchestrator] Phase 1: Running %s (MCP servers: %d)", phase1_agents, len(active_mcp))
        for agent_name in phase1_agents:
            akey = agent_cache_key(agent_name, context, has_mcp=bool(active_mcp))
            cached_data = await cache_get(akey)
            if cached_data:
                logger.info("[Orchestrator] Agent cache HIT: %s", agent_name)
                result = AgentResult(
                    agent_name=agent_name,
                    session_id=request.session_id,
                    status=cached_data.get("status", "success"),
                    data=cached_data.get("data", {}),
                    duration_seconds=0.0,
                    input_tokens=cached_data.get("input_tokens", 0),
                    output_tokens=cached_data.get("output_tokens", 0),
                )
            else:
                agent = AGENT_REGISTRY[agent_name](use_foundry_mode=self.use_foundry_mode)
                result = await agent.run(
                    context,
                    session_id=request.session_id,
                    mcp_servers=active_mcp if active_mcp else None,
                )
                if result.status == "success":
                    await cache_set(akey, result.to_dict(), agent_ttl)

            all_results[agent_name] = result
            if result.status == "success":
                context[f"{agent_name}_results"] = result.data

        # ── Phase 1.5: MCP Enrichment (conditional) ───────────────────────────
        if active_mcp and self.settings.llm_provider == "anthropic":
            logger.info("[Orchestrator] Phase 1.5: MCP Enrichment with %d server(s)", len(active_mcp))
            try:
                enrichment_agent = McpEnrichmentAgent(use_foundry_mode=self.use_foundry_mode)
                enrichment_result = await enrichment_agent.run(
                    context,
                    session_id=request.session_id,
                    mcp_servers=active_mcp,
                )
                all_results["mcp_enrichment"] = enrichment_result
                if enrichment_result.status == "success":
                    context["mcp_enrichment_results"] = enrichment_result.data
                    logger.info(
                        "[Orchestrator] MCP enrichment succeeded — skills called: %s",
                        enrichment_result.data.get("azure_skills_called", []),
                    )
                else:
                    logger.warning(
                        "[Orchestrator] MCP enrichment returned status=%s: %s",
                        enrichment_result.status,
                        enrichment_result.error,
                    )
            except Exception as exc:
                # Non-fatal: pipeline continues without enrichment
                logger.warning("[Orchestrator] MCP enrichment failed (non-fatal): %s", exc)
        else:
            logger.info("[Orchestrator] Phase 1.5: Skipping MCP enrichment (no active servers)")

        # ── Phase 2: Parallel analysis ─────────────────────────────────────────
        if phase2_agents:
            logger.info("[Orchestrator] Phase 2: Running %s in parallel", phase2_agents)
            semaphore = asyncio.Semaphore(self.settings.agent_parallel_limit)

            async def run_with_semaphore(agent_name: str) -> tuple[str, AgentResult]:
                akey = agent_cache_key(agent_name, context)
                cached_data = await cache_get(akey)
                if cached_data:
                    logger.info("[Orchestrator] Agent cache HIT: %s", agent_name)
                    return agent_name, AgentResult(
                        agent_name=agent_name,
                        session_id=request.session_id,
                        status=cached_data.get("status", "success"),
                        data=cached_data.get("data", {}),
                        duration_seconds=0.0,
                        input_tokens=cached_data.get("input_tokens", 0),
                        output_tokens=cached_data.get("output_tokens", 0),
                    )
                async with semaphore:
                    agent = AGENT_REGISTRY[agent_name](use_foundry_mode=self.use_foundry_mode)
                    result = await agent.run(
                        context, session_id=request.session_id
                    )
                    if result.status == "success":
                        await cache_set(akey, result.to_dict(), agent_ttl)
                    return agent_name, result

            phase2_tasks = [run_with_semaphore(name) for name in phase2_agents]
            phase2_outcomes = await asyncio.gather(*phase2_tasks, return_exceptions=True)

            for outcome in phase2_outcomes:
                if isinstance(outcome, Exception):
                    logger.error("[Orchestrator] Phase 2 agent failed: %s", outcome)
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

        synth_in_tok = synth_out_tok = 0
        if self.settings.llm_provider == "anthropic":
            synthesis_data, synth_in_tok, synth_out_tok = await self._synthesize_anthropic(synthesis_prompt)
        else:
            synthesis_data = await self._synthesize_azure(synthesis_prompt)

        # Guard: Claude may return a JSON array instead of object — wrap it
        if isinstance(synthesis_data, list):
            synthesis_data = {"key_findings": synthesis_data}
        elif not isinstance(synthesis_data, dict):
            synthesis_data = {"raw_text": str(synthesis_data)}

        return AnalysisReport(
            session_id=request.session_id,
            project_name=request.project_name,
            source_cloud=request.source_cloud,
            target_cloud=request.target_cloud,
            agent_results=results,
            synthesis=synthesis_data,
            synthesis_input_tokens=synth_in_tok,
            synthesis_output_tokens=synth_out_tok,
        )

    async def _synthesize_anthropic(self, synthesis_prompt: str) -> tuple[dict[str, Any], int, int]:
        """Synthesize via Anthropic Claude claude-opus-4-6. Returns (data, in_tok, out_tok)."""
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
            max_tokens=8192,  # increased from 4096 — synthesis needs room for all sections
            system=system,
            messages=[{"role": "user", "content": synthesis_prompt}],
        )
        raw = response.content[0].text
        clean = self._extract_json(raw)
        in_tok: int = getattr(response.usage, "input_tokens", 0)
        out_tok: int = getattr(response.usage, "output_tokens", 0)
        try:
            return json.loads(clean), in_tok, out_tok
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "[orchestrator] Synthesis JSON parse failed (%s) — first 300 chars: %s…",
                exc, raw[:300],
            )
            # Return minimal synthesis so the report is still usable
            return {
                "executive_summary": (
                    "Synthesis JSON could not be parsed. Review agent results directly."
                ),
                "maturity_score": 2.5,
                "key_findings": [],
                "critical_risks": [],
                "top_10_actions": [],
                "roadmap_phases": [],
            }, in_tok, out_tok

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

    # Fields that are too large or redundant for synthesis context.
    # Stripping these keeps the prompt manageable and synthesis quality high.
    _SYNTHESIS_SKIP_FIELDS = frozenset({
        "raw",               # duplicates all parsed fields (very large)
        "raw_text",          # only present on parse_error; not useful for synthesis
        "sonarqube_analysis",# large; synthesis gets aggregated SonarCloud metrics via code_analyzer summary
        "mcp_guidance",      # Phase-1 MCP output for code (kept for UI, not needed in synthesis)
        "mcp_infra_guidance",# Phase-1 MCP output for infra (same)
    })

    @classmethod
    def _compact_for_synthesis(cls, data: dict) -> dict:
        """Return a synthesis-friendly view of agent data (stripped of heavy/redundant fields)."""
        result: dict = {}
        for k, v in data.items():
            if k in cls._SYNTHESIS_SKIP_FIELDS:
                continue
            # Truncate very large arrays — synthesis needs a representative sample, not every item
            if isinstance(v, list) and len(v) > 20:
                result[k] = v[:20]
            else:
                result[k] = v
        return result

    def _build_synthesis_prompt(
        self, request: AnalysisRequest, results: dict[str, AgentResult]
    ) -> str:
        results_summary = {}
        mcp_enrichment_data = None
        for name, result in results.items():
            if result.status == "success":
                compact_data = self._compact_for_synthesis(result.data)
            else:
                compact_data = {"error": result.error}
            results_summary[name] = {
                "status": result.status,
                "duration_seconds": result.duration_seconds,
                "data": compact_data,
            }
            if name == "mcp_enrichment" and result.status == "success":
                mcp_enrichment_data = result.data

        current_cost_eur = None
        if request.current_monthly_cost_usd:
            # Convert USD → EUR at ~0.93 rate
            current_cost_eur = round(request.current_monthly_cost_usd * 0.93, 0)

        cost_context = (
            f"Current monthly cost: €{current_cost_eur:,.0f} EUR"
            if current_cost_eur
            else "Current monthly cost: not provided"
        )

        # Build the MCP enrichment section if available
        mcp_section = ""
        if mcp_enrichment_data and not mcp_enrichment_data.get("parse_error"):
            pricing = mcp_enrichment_data.get("azure_pricing_estimate", {})
            readiness = mcp_enrichment_data.get("migration_readiness", {})
            waf = mcp_enrichment_data.get("waf_assessment", {})
            advisor = mcp_enrichment_data.get("advisor_recommendations", [])
            ref_archs = mcp_enrichment_data.get("reference_architectures", [])
            skills_called = mcp_enrichment_data.get("azure_skills_called", [])
            mcp_section = f"""
## Azure MCP Enrichment Data (REAL data from Azure Skills — use this to override estimates)

Azure Skills called: {", ".join(skills_called) if skills_called else "none"}

### Migration Readiness (from azure-migrate)
{json.dumps(readiness, indent=2)}

### Azure Pricing Estimate (from Azure Pricing skill — ACTUAL prices)
{json.dumps(pricing, indent=2)}

### Azure Advisor Recommendations
{json.dumps(advisor[:10], indent=2)}

### Well-Architected Framework Assessment
{json.dumps(waf, indent=2)}

### Reference Architectures
{json.dumps(ref_archs[:3], indent=2)}

IMPORTANT: When mcp_enrichment data is present, PREFER it over estimates:
- Use azure_pricing_estimate.monthly_eur for cost calculations
- Use migration_readiness.overall_score to inform maturity_score
- Incorporate advisor_recommendations into top_10_actions
- Reflect waf_assessment scores in key_findings and critical_risks
- Link reference_architectures in the executive_summary
"""

        return f"""
Synthesize the following specialist agent analyses into a unified executive report.

Project: {request.project_name}
Source Cloud: {request.source_cloud}
Target Cloud: {request.target_cloud}
{cost_context}
{mcp_section}
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
  "maturity_score": <REQUIRED JSON number (float) 1.0–5.0; NEVER 0, null, or a string. Derived from code quality, coupling score, infra complexity. Default 2.5 if uncertain.>,
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
  ],
  "effort_detail": <copy the effort_detail object verbatim from migration_planner agent results if present, otherwise null>,
  "app_recommendations": [
    {{
      "category": "<code_quality|refactoring|security|testing|ci_cd|twelve_factor|containerization|dependencies>",
      "priority": "<critical|high|medium|low>",
      "recommendation": "<specific actionable recommendation for developers>",
      "rationale": "<why, referencing actual findings from code_analyzer/quality_analyzer>",
      "effort": "<hours|days|weeks>",
      "standard": "<optional: reference to standard e.g. OWASP Top 10, 12-factor App, CNCF, ISO 27001>"
    }}
  ],
  "infra_recommendations": [
    {{
      "category": "<networking|security|iac|scalability|resilience|cost|monitoring|compliance>",
      "priority": "<critical|high|medium|low>",
      "recommendation": "<specific actionable recommendation for the cloud/infra team>",
      "rationale": "<why, referencing actual findings from infra_analyzer/mcp_enrichment>",
      "effort": "<hours|days|weeks>"
    }}
  ],
  "app_migration_checklist": [
    {{
      "item": "<specific code/app change required for Azure migration>",
      "status": "<required|recommended|optional>",
      "category": "<code_change|config_change|dependency_update|test_update|ci_cd_update>",
      "effort": "<hours|days|weeks>"
    }}
  ]
}}

4. app_recommendations: Generate 6-10 developer-focused recommendations derived from code_analyzer and quality_analyzer data. These should follow standard software development guidelines (12-factor app, SOLID, OWASP, CNCF best practices). Reference the actual coupling_score, technical_debt, and security findings.

5. infra_recommendations: Generate 6-10 infrastructure/architecture recommendations derived from infra_analyzer and mcp_enrichment data. Focus on Azure-specific patterns, networking, IaC quality, monitoring, resilience.

6. app_migration_checklist: Generate 8-15 concrete code/app changes required for the Azure migration. Examples: "Replace AWS SDK with Azure SDK", "Update connection strings to Azure format", "Configure Azure AD authentication", "Update Docker base images for Azure Container Registry".
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
        synthesis_input_tokens: int = 0,
        synthesis_output_tokens: int = 0,
    ):
        self.session_id = session_id
        self.project_name = project_name
        self.source_cloud = source_cloud
        self.target_cloud = target_cloud
        self.agent_results = agent_results
        self.synthesis = synthesis
        self.synthesis_input_tokens = synthesis_input_tokens
        self.synthesis_output_tokens = synthesis_output_tokens

    @property
    def total_input_tokens(self) -> int:
        return (
            sum(r.input_tokens for r in self.agent_results.values())
            + self.synthesis_input_tokens
        )

    @property
    def total_output_tokens(self) -> int:
        return (
            sum(r.output_tokens for r in self.agent_results.values())
            + self.synthesis_output_tokens
        )

    @property
    def total_cost_eur(self) -> float:
        from src.config.settings import get_settings
        s = get_settings()
        cost_usd = (
            self.total_input_tokens * s.claude_input_price_per_1m_usd / 1_000_000
            + self.total_output_tokens * s.claude_output_price_per_1m_usd / 1_000_000
        )
        return round(cost_usd * s.eur_usd_rate, 4)

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
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_cost_eur": self.total_cost_eur,
        }
