"""
Azure Foundry Architect Framework — FastAPI Application
"""
import logging
import time

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.models.responses import HealthResponse
from src.api.routes.analysis import router as analysis_router
from src.api.routes.artifacts import router as artifacts_router
from src.api.routes.performance import router as performance_router
from src.config.settings import get_settings

# ── Logging setup ─────────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Azure Foundry Architect Framework",
    description=(
        "Multi-agent framework for cloud architecture analysis, migration planning, "
        "cost optimization, and Well-Architected Framework review. "
        "Powered by Azure AI Foundry."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request logging middleware ─────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 1)
    logger.info(
        f"{request.method} {request.url.path} → {response.status_code} ({duration}ms)"
    )
    return response


# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(analysis_router)
app.include_router(artifacts_router)
app.include_router(performance_router)


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    foundry_connected = bool(settings.azure_ai_project_connection_string)

    return HealthResponse(
        status="healthy",
        version="1.0.0",
        agents_available=[
            "code_analyzer",
            "infra_analyzer",
            "cost_optimizer",
            "migration_planner",
            "gap_analyzer",
            "waf_reviewer",
            "quality_analyzer",
        ],
        foundry_connected=foundry_connected,
    )


@app.get("/", tags=["System"])
async def root() -> dict:
    return {
        "name": "Azure Foundry Architect Framework",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "agents": [
            "code_analyzer",
            "infra_analyzer",
            "cost_optimizer",
            "migration_planner",
            "gap_analyzer",
            "waf_reviewer",
            "quality_analyzer",
        ],
    }


# ── Exception handlers ─────────────────────────────────────────────────────────
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.error(f"422 Validation error on {request.url.path}: {exc.errors()}")
    # Convert errors to JSON-serializable format
    errors = []
    for error in exc.errors():
        error_dict = {
            "loc": error.get("loc", []),
            "msg": error.get("msg", ""),
            "type": error.get("type", ""),
        }
        # Convert ctx values to strings if present
        if "ctx" in error:
            error_dict["ctx"] = {k: str(v) for k, v in error["ctx"].items()}
        errors.append(error_dict)
    
    return JSONResponse(
        status_code=422,
        content={"detail": errors},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled exception on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )
