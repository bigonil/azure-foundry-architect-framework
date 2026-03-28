"""API request models."""
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class CloudProvider(str, Enum):
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"
    ON_PREMISES = "on-premises"
    HYBRID = "hybrid"


class AnalysisType(str, Enum):
    ALL = "all"
    CODE = "code_analyzer"
    INFRA = "infra_analyzer"
    COST = "cost_optimizer"
    MIGRATION = "migration_planner"
    GAP = "gap_analyzer"
    WAF = "waf_reviewer"


class ArtifactItem(BaseModel):
    filename: str
    content: str
    encoding: str = "utf-8"


class AnalysisRequestBody(BaseModel):
    project_name: str = Field(..., min_length=1, max_length=200)
    source_cloud: CloudProvider
    target_cloud: CloudProvider = CloudProvider.AZURE
    analysis_types: list[AnalysisType] = Field(default=[AnalysisType.ALL])
    code_artifacts: list[ArtifactItem] = Field(default_factory=list)
    iac_artifacts: list[ArtifactItem] = Field(default_factory=list)
    current_monthly_cost_usd: float | None = Field(default=None, ge=0)
    additional_context: str = Field(default="", max_length=2000)
    use_foundry_mode: bool = Field(
        default=False,
        description="Use Azure AI Foundry Agent Service (true) or direct OpenAI (false)",
    )

    @field_validator("analysis_types")
    @classmethod
    def validate_analysis_types(cls, v: list[AnalysisType]) -> list[AnalysisType]:
        if not v:
            return [AnalysisType.ALL]
        return v

    @field_validator("code_artifacts", "iac_artifacts")
    @classmethod
    def validate_artifact_count(cls, v: list[ArtifactItem]) -> list[ArtifactItem]:
        if len(v) > 100:
            raise ValueError("Maximum 100 artifacts per request")
        return v

    def to_agent_context(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "source_cloud": self.source_cloud.value,
            "target_cloud": self.target_cloud.value,
            "analysis_types": [t.value for t in self.analysis_types],
            "code_artifacts": [a.model_dump() for a in self.code_artifacts],
            "iac_artifacts": [a.model_dump() for a in self.iac_artifacts],
            "current_monthly_cost_usd": self.current_monthly_cost_usd,
            "additional_context": self.additional_context,
        }
