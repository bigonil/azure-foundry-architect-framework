"""
Central configuration using Pydantic Settings.
Supports: .env file, environment variables, Azure Key Vault (production).
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

    # ── Azure AI Foundry ───────────────────────────────────────────────────────
    azure_ai_project_connection_string: str = Field(default="")
    azure_ai_foundry_endpoint: str = Field(default="")

    # ── Azure OpenAI ──────────────────────────────────────────────────────────
    azure_openai_endpoint: str = Field(default="")
    azure_openai_api_key: str = Field(default="")
    azure_openai_deployment_gpt4o: str = "gpt-4o"
    azure_openai_deployment_gpt4o_mini: str = "gpt-4o-mini"
    azure_openai_api_version: str = "2025-01-01-preview"

    # ── Azure AI Search ───────────────────────────────────────────────────────
    azure_search_endpoint: str = Field(default="")
    azure_search_key: str = Field(default="")
    azure_search_index_caf: str = "caf-guidelines"
    azure_search_index_waf: str = "waf-pillars"
    azure_search_index_patterns: str = "migration-patterns"

    # ── Cosmos DB ─────────────────────────────────────────────────────────────
    cosmos_endpoint: str = Field(default="")
    cosmos_key: str = Field(default="")
    cosmos_database: str = "architect-framework"
    cosmos_container_sessions: str = "sessions"
    cosmos_container_reports: str = "reports"

    # ── Key Vault ─────────────────────────────────────────────────────────────
    key_vault_url: str = Field(default="")

    # ── Agent ─────────────────────────────────────────────────────────────────
    agent_max_tokens: int = 4096
    agent_temperature: float = 0.1
    agent_parallel_limit: int = 4
    agent_timeout_seconds: int = 300

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
        """Use Managed Identity when keys are empty (production pattern)."""
        return not self.azure_openai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
