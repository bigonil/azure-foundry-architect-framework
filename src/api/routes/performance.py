"""
Performance Analysis API routes — analisi performance e refactoring del codice.
"""
import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from src.agents.performance_orchestrator import PerformanceOrchestrator
from src.api.models.requests import AnalysisRequestBody
from src.api.models.responses import AnalysisSessionResponse
from src.config.settings import get_settings

router = APIRouter(prefix="/api/performance", tags=["Performance Analysis"])
logger = logging.getLogger(__name__)

_settings = get_settings()
_mongo_client: AsyncIOMotorClient = AsyncIOMotorClient(_settings.mongodb_uri)


def _db():
    return _mongo_client[_settings.mongodb_database]


@router.post("/analyze", response_model=AnalysisSessionResponse, status_code=202)
async def start_performance_analysis(
    request: AnalysisRequestBody,
    background_tasks: BackgroundTasks,
) -> AnalysisSessionResponse:
    """
    Avvia un'analisi delle performance del codice con 4 agenti specializzati:
    1. Architect: Analizza dipendenze e SOLID principles
    2. Coder: Trasforma il codice seguendo best practices
    3. Optimizer: Ottimizza performance (con feedback loop)
    4. Validator: Valida sicurezza e genera test
    
    Returns:
        Session ID per recuperare i risultati
    """
    from src.api.routes.analysis import _resolve_artifacts
    
    # Risolvi gli artifact dal source_config
    code_artifacts, iac_artifacts = await _resolve_artifacts(request)
    
    if not code_artifacts:
        raise HTTPException(
            status_code=422,
            detail="No code artifacts found. Performance analysis requires source code files."
        )
    
    session_id = f"perf_{int(time.time() * 1000)}"
    
    # Salva la sessione nel database
    await _db()[_settings.mongodb_collection_sessions].insert_one({
        "_id": session_id,
        "type": "performance",
        "status": "running",
        "project_name": request.project_name,
        "started_at": time.time(),
        "code_artifacts_count": len(code_artifacts),
    })
    
    # Avvia l'analisi in background
    background_tasks.add_task(
        _run_performance_analysis,
        session_id=session_id,
        project_name=request.project_name,
        code_artifacts=code_artifacts,
        additional_context=request.additional_context,
        use_foundry_mode=request.use_foundry_mode,
    )
    
    logger.info(
        f"Performance analysis session {session_id} started for project '{request.project_name}' "
        f"with {len(code_artifacts)} code files"
    )
    
    return AnalysisSessionResponse(
        session_id=session_id,
        status="running",
        message=f"Performance analysis started. Poll /api/performance/{session_id} for results.",
        estimated_duration_minutes=10,
    )


@router.get("/{session_id}")
async def get_performance_report(session_id: str) -> dict[str, Any]:
    """Recupera il report dell'analisi delle performance."""
    session = await _db()[_settings.mongodb_collection_sessions].find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    
    if session["status"] == "running":
        raise HTTPException(
            status_code=202,
            detail={
                "status": "running",
                "message": "Performance analysis in progress, please retry in a few seconds",
                "elapsed_seconds": round(time.time() - session.get("started_at", time.time()), 1),
            },
        )
    
    if session["status"] == "failed":
        raise HTTPException(
            status_code=500,
            detail={"status": "failed", "error": session.get("error", "Unknown error")},
        )
    
    # Recupera il report
    report = await _db()["performance_reports"].find_one({"_id": session_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.pop("_id", None)
    return report


@router.get("/", response_model=list[dict])
async def list_performance_sessions() -> list[dict]:
    """List all performance analysis sessions."""
    cursor = _db()[_settings.mongodb_collection_sessions].find(
        {"type": "performance"}, 
        {"_id": 1, "status": 1, "project_name": 1, "started_at": 1}
    )
    return [
        {
            "session_id": s["_id"],
            "status": s["status"],
            "project_name": s.get("project_name"),
            "started_at": s.get("started_at"),
            "type": "performance",
        }
        async for s in cursor
    ]


@router.get("/{session_id}/status")
async def get_performance_status(session_id: str) -> dict[str, Any]:
    """Ottieni lo stato corrente dell'analisi delle performance."""
    session = await _db()[_settings.mongodb_collection_sessions].find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    
    return {
        "session_id": session_id,
        "status": session["status"],
        "project_name": session.get("project_name"),
        "type": session.get("type", "performance"),
        "elapsed_seconds": round(time.time() - session.get("started_at", time.time()), 1),
        "error": session.get("error"),
    }


async def _run_performance_analysis(
    session_id: str,
    project_name: str,
    code_artifacts: list[dict],
    additional_context: str = "",
    use_foundry_mode: bool = False,
) -> None:
    """Background task per eseguire l'analisi delle performance."""
    col_sessions = _db()[_settings.mongodb_collection_sessions]
    col_reports = _db()["performance_reports"]
    
    try:
        orchestrator = PerformanceOrchestrator(use_foundry_mode=use_foundry_mode)
        
        report = await orchestrator.analyze(
            project_name=project_name,
            code_artifacts=code_artifacts,
            additional_context=additional_context,
            max_optimization_iterations=2,
            performance_targets={
                "response_time_ms": 100,
                "memory_usage_mb": 100,
                "throughput_rps": 500,
            },
        )
        
        # Salva il report
        await col_reports.insert_one({"_id": session_id, **report})
        
        # Aggiorna lo stato della sessione
        await col_sessions.update_one(
            {"_id": session_id},
            {"$set": {"status": "completed", "completed_at": time.time()}}
        )
        
        logger.info(
            f"Performance analysis session {session_id} completed — "
            f"Status: {report.get('status', 'unknown')} — "
            f"Duration: {report.get('total_duration_seconds', 0):.1f}s"
        )
        
    except Exception as exc:
        logger.error(f"Performance analysis session {session_id} failed: {exc}", exc_info=True)
        await col_sessions.update_one(
            {"_id": session_id},
            {"$set": {"status": "failed", "error": str(exc), "failed_at": time.time()}}
        )
