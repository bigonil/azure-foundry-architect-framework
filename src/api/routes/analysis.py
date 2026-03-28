"""
Analysis API routes — submit analysis requests and retrieve reports.
"""
import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse

from src.agents.orchestrator import AnalysisRequest, OrchestratorAgent
from src.api.models.requests import AnalysisRequestBody, AnalysisType, CloudProvider
from src.api.models.responses import (
    AgentResultSummary,
    AnalysisReportResponse,
    AnalysisSessionResponse,
)

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])
logger = logging.getLogger(__name__)

# In-memory session store (replace with Cosmos DB in production)
_sessions: dict[str, dict[str, Any]] = {}
_reports: dict[str, Any] = {}


@router.post("/start", response_model=AnalysisSessionResponse, status_code=202)
async def start_analysis(
    request: AnalysisRequestBody,
    background_tasks: BackgroundTasks,
) -> AnalysisSessionResponse:
    """
    Submit a new architectural analysis request.
    Returns immediately with a session_id; analysis runs in the background.
    Poll GET /api/analysis/{session_id} for results.
    """
    analysis_request = AnalysisRequest(
        project_name=request.project_name,
        source_cloud=request.source_cloud.value,
        target_cloud=request.target_cloud.value,
        analysis_types=[t.value for t in request.analysis_types],
        code_artifacts=[a.model_dump() for a in request.code_artifacts],
        iac_artifacts=[a.model_dump() for a in request.iac_artifacts],
        current_monthly_cost_usd=request.current_monthly_cost_usd,
        additional_context=request.additional_context,
    )

    session_id = analysis_request.session_id
    _sessions[session_id] = {
        "status": "running",
        "project_name": request.project_name,
        "started_at": time.time(),
    }

    background_tasks.add_task(
        _run_analysis,
        analysis_request,
        use_foundry_mode=request.use_foundry_mode,
    )

    logger.info(f"Analysis session {session_id} started for project '{request.project_name}'")

    return AnalysisSessionResponse(
        session_id=session_id,
        status="running",
        message=f"Analysis started. Poll /api/analysis/{session_id} for results.",
        estimated_duration_minutes=5,
    )


@router.get("/{session_id}", response_model=AnalysisReportResponse)
async def get_analysis_report(session_id: str) -> AnalysisReportResponse:
    """Retrieve the analysis report for a completed session."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    session = _sessions[session_id]

    if session["status"] == "running":
        raise HTTPException(
            status_code=202,
            detail={
                "status": "running",
                "message": "Analysis in progress, please retry in a few seconds",
                "elapsed_seconds": round(time.time() - session.get("started_at", time.time()), 1),
            },
        )

    if session["status"] == "failed":
        raise HTTPException(
            status_code=500,
            detail={"status": "failed", "error": session.get("error", "Unknown error")},
        )

    report = _reports.get(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return report


@router.post("/quick-scan", response_model=AnalysisReportResponse)
async def quick_scan(request: AnalysisRequestBody) -> AnalysisReportResponse:
    """
    Synchronous quick scan — runs analysis and waits for results.
    Suitable for small projects (< 10 files, no deep code analysis).
    Timeout: 120 seconds.
    """
    analysis_request = AnalysisRequest(
        project_name=request.project_name,
        source_cloud=request.source_cloud.value,
        target_cloud=request.target_cloud.value,
        analysis_types=[t.value for t in request.analysis_types],
        code_artifacts=[a.model_dump() for a in request.code_artifacts],
        iac_artifacts=[a.model_dump() for a in request.iac_artifacts],
        current_monthly_cost_usd=request.current_monthly_cost_usd,
        additional_context=request.additional_context,
    )

    try:
        report = await asyncio.wait_for(
            _execute_analysis(analysis_request, use_foundry_mode=request.use_foundry_mode),
            timeout=120.0,
        )
        return report
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=408,
            detail="Analysis timed out. Use /start for async processing of large projects.",
        )


@router.get("/{session_id}/status")
async def get_session_status(session_id: str) -> dict[str, Any]:
    """Get the current status of an analysis session."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    session = _sessions[session_id]
    return {
        "session_id": session_id,
        "status": session["status"],
        "project_name": session.get("project_name"),
        "elapsed_seconds": round(time.time() - session.get("started_at", time.time()), 1),
        "error": session.get("error"),
    }


@router.get("/", response_model=list[dict])
async def list_sessions() -> list[dict]:
    """List all analysis sessions."""
    return [
        {
            "session_id": sid,
            "status": s["status"],
            "project_name": s.get("project_name"),
            "started_at": s.get("started_at"),
        }
        for sid, s in _sessions.items()
    ]


async def _run_analysis(request: AnalysisRequest, use_foundry_mode: bool = False) -> None:
    """Background task wrapper."""
    try:
        report = await _execute_analysis(request, use_foundry_mode)
        _sessions[request.session_id]["status"] = "completed"
        _reports[request.session_id] = report
    except Exception as e:
        logger.error(f"Analysis session {request.session_id} failed: {e}")
        _sessions[request.session_id]["status"] = "failed"
        _sessions[request.session_id]["error"] = str(e)


async def _execute_analysis(
    request: AnalysisRequest, use_foundry_mode: bool = False
) -> AnalysisReportResponse:
    """Core execution logic."""
    orchestrator = OrchestratorAgent(use_foundry_mode=use_foundry_mode)
    report = await orchestrator.analyze(request)

    report_dict = report.to_dict()

    return AnalysisReportResponse(
        session_id=report.session_id,
        project_name=report.project_name,
        source_cloud=report.source_cloud,
        target_cloud=report.target_cloud,
        status="completed",
        synthesis=report.synthesis,
        agent_results={
            name: AgentResultSummary(
                agent_name=result.agent_name,
                status=result.status,
                duration_seconds=result.duration_seconds,
                error=result.error,
            )
            for name, result in report.agent_results.items()
        },
        created_at=time.time(),
    )
