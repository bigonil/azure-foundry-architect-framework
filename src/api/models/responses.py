"""API response models."""
from typing import Any

from pydantic import BaseModel


class AnalysisSessionResponse(BaseModel):
    session_id: str
    status: str
    message: str
    estimated_duration_minutes: int = 5


class AgentResultSummary(BaseModel):
    agent_name: str
    status: str
    duration_seconds: float
    error: str | None = None


class AnalysisReportResponse(BaseModel):
    session_id: str
    project_name: str
    source_cloud: str
    target_cloud: str
    status: str
    synthesis: dict[str, Any]
    agent_results: dict[str, AgentResultSummary]
    created_at: float
    sonarqube_analysis: dict[str, Any] | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    agents_available: list[str]
    foundry_connected: bool
