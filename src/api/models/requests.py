"""API request models."""
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


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
    QUALITY = "quality_analyzer"


class ArtifactItem(BaseModel):
    filename: str
    content: str
    encoding: str = "utf-8"


# ── Source configuration models ───────────────────────────────────────────────

class VolumeSourceConfig(BaseModel):
    """Read artifacts from a directory mounted into the container at /app/uploads."""
    type: Literal["volume"] = "volume"
    code_folder: str = Field(
        default="",
        description="Path relative to /app/uploads to scan for code files. Empty = root.",
    )
    iac_folder: str = Field(
        default="",
        description="Path relative to /app/uploads to scan for IaC files. Empty = root.",
    )


class GitHubSourceConfig(BaseModel):
    """Clone a GitHub repository server-side."""
    type: Literal["github"] = "github"
    repo_url: str = Field(..., description="HTTPS URL, e.g. https://github.com/org/repo")
    branch: str = Field(default="main")
    token: str | None = Field(default=None, description="GitHub PAT (required for private repos)")
    code_folder: str = Field(default="", description="Sub-folder to scan for code files")
    iac_folder: str = Field(default="", description="Sub-folder to scan for IaC files")


class DevOpsSourceConfig(BaseModel):
    """Clone an Azure DevOps repository server-side."""
    type: Literal["devops"] = "devops"
    org_url: str = Field(..., description="e.g. https://dev.azure.com/myorg")
    project: str = Field(..., description="DevOps project name")
    repo: str = Field(..., description="Repository name")
    branch: str = Field(default="main")
    token: str = Field(..., description="Azure DevOps Personal Access Token (PAT)")
    code_folder: str = Field(default="", description="Sub-folder to scan for code files")
    iac_folder: str = Field(default="", description="Sub-folder to scan for IaC files")


class BlobArtifactRef(BaseModel):
    """Reference to a file already uploaded to object storage (MinIO / Azure Blob)."""
    key: str = Field(..., description="Storage key returned by POST /api/artifacts/presign")
    filename: str = Field(..., description="Original filename (used as artifact filename)")
    artifact_type: Literal["code", "iac"] = Field(..., description="'code' or 'iac'")


class BlobSourceConfig(BaseModel):
    """Read artifacts from object storage (MinIO locally, Azure Blob in production)."""
    type: Literal["blob"] = "blob"
    artifacts: list[BlobArtifactRef] = Field(
        ...,
        min_length=1,
        description="List of artifact references previously uploaded via /api/artifacts/presign",
    )


SourceConfig = VolumeSourceConfig | GitHubSourceConfig | DevOpsSourceConfig | BlobSourceConfig


# ── MCP Server configuration ──────────────────────────────────────────────────

class McpServerConfig(BaseModel):
    """Configuration for an external MCP server used to enrich analysis."""
    id: str = Field(..., description="Unique identifier, e.g. 'azure-mcp'")
    name: str = Field(..., description="Display name, e.g. 'Azure MCP'")
    type: Literal["url", "stdio"] = Field(default="url", description="Transport type")
    url: str | None = Field(
        default=None,
        description="HTTP/SSE URL for type='url' servers. Must be set for the server to be called.",
    )
    enabled: bool = Field(default=True, description="Whether to include this server in the analysis call")
    cloud: str = Field(default="", description="Cloud group label: azure | devops | aws | gcp")
    preconfigured: bool = Field(
        default=False,
        description="Server URL is managed server-side (internal Docker service). "
                    "Frontend sends only the toggle; backend injects the real URL.",
    )
    authorization_token: str | None = Field(
        default=None,
        description="Bearer token passed to the Anthropic MCP beta for authenticated servers.",
    )


# ── Main request body ─────────────────────────────────────────────────────────

class AnalysisRequestBody(BaseModel):
    project_name: str = Field(..., min_length=1, max_length=200)
    source_cloud: CloudProvider
    target_cloud: CloudProvider = CloudProvider.AZURE
    analysis_types: list[AnalysisType] = Field(default=[AnalysisType.ALL])

    # Inline artifacts (upload mode) — optional when source_config is provided
    code_artifacts: list[ArtifactItem] = Field(default_factory=list)
    iac_artifacts: list[ArtifactItem] = Field(default_factory=list)

    # External source (volume / github / devops) — optional
    source_config: SourceConfig | None = Field(
        default=None,
        description="When set, artifacts are fetched server-side from this source.",
        discriminator="type",
    )

    current_monthly_cost_usd: float | None = Field(default=None, ge=0)
    additional_context: str = Field(default="", max_length=2000)
    mcp_servers: list[McpServerConfig] = Field(
        default_factory=list,
        description="Optional MCP servers to enrich the analysis (URL-type only, requires Anthropic mode)",
    )
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
        if len(v) > 500:
            raise ValueError("Maximum 500 artifacts per request")
        return v

    @model_validator(mode="after")
    def validate_artifact_source(self) -> "AnalysisRequestBody":
        has_inline = bool(self.code_artifacts or self.iac_artifacts)
        has_source = self.source_config is not None
        if not has_inline and not has_source:
            raise ValueError(
                "Provide at least one artifact source: upload files (code_artifacts / iac_artifacts) "
                "or set source_config (volume, github, or devops)."
            )
        return self

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
