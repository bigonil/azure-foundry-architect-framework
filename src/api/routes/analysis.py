"""
Analysis API routes — submit analysis requests and retrieve reports.
"""
import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from src.agents.orchestrator import AnalysisRequest, OrchestratorAgent
from src.api.models.requests import AnalysisRequestBody
from src.api.models.responses import (
    AgentResultSummary,
    AnalysisReportResponse,
    AnalysisSessionResponse,
)
from src.config.settings import get_settings

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])
logger = logging.getLogger(__name__)

_settings = get_settings()
_mongo_client: AsyncIOMotorClient = AsyncIOMotorClient(_settings.mongodb_uri)


def _db():
    return _mongo_client[_settings.mongodb_database]


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
    await _db()[_settings.mongodb_collection_sessions].insert_one({
        "_id": session_id,
        "status": "running",
        "project_name": request.project_name,
        "started_at": time.time(),
    })

    background_tasks.add_task(
        _run_analysis,
        analysis_request,
        use_foundry_mode=request.use_foundry_mode,
    )

    logger.info("Analysis session %s started for project '%s'", session_id, request.project_name)

    return AnalysisSessionResponse(
        session_id=session_id,
        status="running",
        message=f"Analysis started. Poll /api/analysis/{session_id} for results.",
        estimated_duration_minutes=5,
    )


@router.get("/{session_id}", response_model=AnalysisReportResponse)
async def get_analysis_report(session_id: str) -> AnalysisReportResponse:
    """Retrieve the analysis report for a completed session."""
    session = await _db()[_settings.mongodb_collection_sessions].find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

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

    report = await _db()[_settings.mongodb_collection_reports].find_one({"_id": session_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.pop("_id", None)
    return AnalysisReportResponse(**report)


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
            timeout=float(_settings.agent_timeout_seconds),
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
    session = await _db()[_settings.mongodb_collection_sessions].find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

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
    cursor = _db()[_settings.mongodb_collection_sessions].find(
        {}, {"_id": 1, "status": 1, "project_name": 1, "started_at": 1}
    )
    return [
        {
            "session_id": s["_id"],
            "status": s["status"],
            "project_name": s.get("project_name"),
            "started_at": s.get("started_at"),
        }
        async for s in cursor
    ]


async def _run_analysis(request: AnalysisRequest, use_foundry_mode: bool = False) -> None:
    """Background task wrapper."""
    col_sessions = _db()[_settings.mongodb_collection_sessions]
    col_reports = _db()[_settings.mongodb_collection_reports]
    try:
        report = await _execute_analysis(request, use_foundry_mode)
        await col_sessions.update_one({"_id": request.session_id}, {"$set": {"status": "completed"}})
        await col_reports.insert_one({"_id": request.session_id, **report.model_dump()})
    except Exception as exc:
        logger.error("Analysis session %s failed: %s", request.session_id, exc)
        await col_sessions.update_one(
            {"_id": request.session_id},
            {"$set": {"status": "failed", "error": str(exc)}},
        )


async def _execute_analysis(
    request: AnalysisRequest, use_foundry_mode: bool = False
) -> AnalysisReportResponse:
    """Core execution logic."""
    orchestrator = OrchestratorAgent(use_foundry_mode=use_foundry_mode)
    report = await orchestrator.analyze(request)

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
