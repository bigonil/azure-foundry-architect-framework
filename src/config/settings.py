"""
Central configuration using Pydantic Settings.
Supports .env file and environment variables.
Local mode: LLM_PROVIDER=anthropic (default)
Azure mode: LLM_PROVIDER=azure (requires Azure credentials)
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    app_log_level: str = "INFO"
    app_max_file_size_mb: int = 50
    app_allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.app_allowed_origins.split(",")]

    # ── LLM Provider ─────────────────────────────────────────────────────────
    # "anthropic" = local mode using Anthropic API (Claude claude-opus-4-6)
    # "azure"     = production mode using Azure OpenAI
    llm_provider: Literal["anthropic", "azure"] = "anthropic"

    # ── Anthropic (local mode) ────────────────────────────────────────────────
    anthropic_api_key: str = Field(default="")
    anthropic_model: str = "claude-opus-4-6"

    # ── Azure AI Foundry (production mode — optional) ─────────────────────────
    azure_ai_project_connection_string: str = Field(default="")
    azure_ai_foundry_endpoint: str = Field(default="")

    # ── Azure OpenAI (production mode — optional) ──────────────────────────────
    azure_openai_endpoint: str = Field(default="")
    azure_openai_api_key: str = Field(default="")
    azure_openai_deployment_gpt4o: str = "gpt-4o"
    azure_openai_deployment_gpt4o_mini: str = "gpt-4o-mini"
    azure_openai_api_version: str = "2025-01-01-preview"

    # ── Azure AI Search (optional) ────────────────────────────────────────────
    azure_search_endpoint: str = Field(default="")
    azure_search_key: str = Field(default="")
    azure_search_index_caf: str = "caf-guidelines"
    azure_search_index_waf: str = "waf-pillars"
    azure_search_index_patterns: str = "migration-patterns"

    # ── MongoDB ───────────────────────────────────────────────────────────────
    mongodb_uri: str = Field(default="mongodb://admin:changeme_local@localhost:27017/efesto-fabryc?authSource=admin")
    mongodb_database: str = "efesto-fabryc"
    mongodb_collection_sessions: str = "sessions"
    mongodb_collection_reports: str = "reports"

    # ── SonarCloud ────────────────────────────────────────────────────────────
    sonarcloud_token: str = Field(default="")
    sonarcloud_org: str = Field(default="")  # organization key (slug), e.g. luca-bigoni

    # ── Redis (cache) ─────────────────────────────────────────────────────────
    redis_uri: str = Field(default="redis://localhost:6379/0")
    cache_report_ttl_hours: int = 24  # full-report cache TTL
    cache_agent_ttl_hours: int = 48   # per-agent result cache TTL

    # ── Key Vault (optional) ──────────────────────────────────────────────────
    key_vault_url: str = Field(default="")

    # ── Agent ─────────────────────────────────────────────────────────────────
    agent_max_tokens: int = 4096
    agent_temperature: float = 0.1
    agent_parallel_limit: int = 4
    agent_timeout_seconds: int = 300

    # ── Object Storage ────────────────────────────────────────────────────────
    # "minio"    = local MinIO via boto3 (S3-compatible)
    # "azure"    = Azure Blob Storage via azure-storage-blob SDK
    # "disabled" = object storage not available (upload-only mode)
    storage_backend: Literal["minio", "azure", "disabled"] = "disabled"

    # MinIO (local) ──────────────────────────────────────────────────────────
    # minio_endpoint       : URL used by the *backend* to reach MinIO
    #                        (Docker internal: http://minio:9000)
    # minio_public_endpoint: URL embedded in presigned URLs returned to the browser
    #                        (always http://localhost:9000 for local dev)
    minio_endpoint: str = "http://localhost:9005"
    minio_public_endpoint: str = "http://localhost:9005"
    minio_access_key: str = "efesto"
    minio_secret_key: str = "changeme_local_minio"
    minio_bucket: str = "efesto-artifacts"
    minio_presign_expiry_seconds: int = 3600

    # Azure Blob Storage (production) ────────────────────────────────────────
    # connection_string empty → falls back to DefaultAzureCredential (Managed Identity)
    azure_storage_account_name: str = Field(default="")
    azure_storage_connection_string: str = Field(default="")
    azure_storage_container: str = "efesto-artifacts"

    # ── Pricing ───────────────────────────────────────────────────────────────
    azure_pricing_api: str = "https://prices.azure.com/api/retail/prices"
    aws_pricing_enabled: bool = False
    gcp_pricing_enabled: bool = False

    @field_validator("agent_temperature")
    @classmethod
    def validate_temperature(cls, v: float) -> float:
        if not 0.0 <= v <= 2.0:
            raise ValueError("agent_temperature must be between 0.0 and 2.0")
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def use_managed_identity(self) -> bool:
        """Use Managed Identity when Azure keys are empty (production pattern)."""
        return self.llm_provider == "azure" and not self.azure_openai_api_key

    @property
    def is_local_mode(self) -> bool:
        return self.llm_provider == "anthropic"


@lru_cache
def get_settings() -> Settings:
    return Settings()
