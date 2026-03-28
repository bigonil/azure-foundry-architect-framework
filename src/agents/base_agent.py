"""
Base agent class for all specialized agents.
Uses Azure AI Foundry Agent Service via azure-ai-projects SDK.
"""
import asyncio
import logging
import time
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import yaml
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    AgentThread,
    MessageRole,
    RunStatus,
    ToolDefinition,
)
from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
from openai import AzureOpenAI

from src.config.settings import get_settings

logger = logging.getLogger(__name__)
PROMPTS_DIR = Path(__file__).parent.parent / "config" / "prompts"


class AgentResult:
    """Structured result from an agent execution."""

    def __init__(
        self,
        agent_name: str,
        session_id: str,
        status: str,
        data: dict[str, Any],
        duration_seconds: float,
        error: str | None = None,
    ):
        self.agent_name = agent_name
        self.session_id = session_id
        self.status = status  # "success" | "partial" | "failed"
        self.data = data
        self.duration_seconds = duration_seconds
        self.error = error
        self.timestamp = time.time()

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_name": self.agent_name,
            "session_id": self.session_id,
            "status": self.status,
            "data": self.data,
            "duration_seconds": self.duration_seconds,
            "error": self.error,
            "timestamp": self.timestamp,
        }


class BaseAgent(ABC):
    """
    Abstract base for all specialist agents.

    Two execution modes:
    - Foundry Mode: Uses Azure AI Foundry Agent Service (full persistence, threading)
    - Direct Mode: Direct Azure OpenAI chat completion (lower latency, simpler)
    """

    def __init__(self, use_foundry_mode: bool = True):
        self.settings = get_settings()
        self.use_foundry_mode = use_foundry_mode
        self._prompt_config = self._load_prompt_config()
        self._client: AIProjectClient | None = None
        self._openai_client: AzureOpenAI | None = None
        self._agent_id: str | None = None

    def _load_prompt_config(self) -> dict[str, Any]:
        prompt_file = PROMPTS_DIR / f"{self.agent_name}.yaml"
        with open(prompt_file) as f:
            return yaml.safe_load(f)

    @property
    @abstractmethod
    def agent_name(self) -> str:
        """Unique identifier for this agent."""

    @property
    def system_prompt(self) -> str:
        return self._prompt_config["system_prompt"]

    @property
    def model(self) -> str:
        return self._prompt_config.get(
            "model", self.settings.azure_openai_deployment_gpt4o
        )

    @property
    def temperature(self) -> float:
        return self._prompt_config.get("temperature", self.settings.agent_temperature)

    @property
    def max_tokens(self) -> int:
        return self._prompt_config.get("max_tokens", self.settings.agent_max_tokens)

    def _get_credential(self):
        if self.settings.use_managed_identity:
            return ManagedIdentityCredential()
        return DefaultAzureCredential()

    def _get_foundry_client(self) -> AIProjectClient:
        if not self._client:
            self._client = AIProjectClient.from_connection_string(
                conn_str=self.settings.azure_ai_project_connection_string,
                credential=self._get_credential(),
            )
        return self._client

    def _get_openai_client(self) -> AzureOpenAI:
        if not self._openai_client:
            kwargs = {
                "azure_endpoint": self.settings.azure_openai_endpoint,
                "api_version": self.settings.azure_openai_api_version,
            }
            if self.settings.azure_openai_api_key:
                kwargs["api_key"] = self.settings.azure_openai_api_key
            else:
                from azure.identity import get_bearer_token_provider
                token_provider = get_bearer_token_provider(
                    self._get_credential(),
                    "https://cognitiveservices.azure.com/.default",
                )
                kwargs["azure_ad_token_provider"] = token_provider
            self._openai_client = AzureOpenAI(**kwargs)
        return self._openai_client

    @abstractmethod
    def get_tools(self) -> list[ToolDefinition]:
        """Return the list of tools this agent can use."""

    @abstractmethod
    def build_user_message(self, context: dict[str, Any]) -> str:
        """Build the user message from the analysis context."""

    @abstractmethod
    def parse_response(self, raw_response: str) -> dict[str, Any]:
        """Parse the agent's raw text response into structured data."""

    async def run(self, context: dict[str, Any], session_id: str | None = None) -> AgentResult:
        """Execute the agent with the given context."""
        session_id = session_id or str(uuid.uuid4())
        start_time = time.time()

        logger.info(f"[{self.agent_name}] Starting analysis for session {session_id}")

        try:
            if self.use_foundry_mode:
                result_data = await self._run_foundry(context, session_id)
            else:
                result_data = await self._run_direct(context, session_id)

            duration = time.time() - start_time
            logger.info(f"[{self.agent_name}] Completed in {duration:.1f}s")

            return AgentResult(
                agent_name=self.agent_name,
                session_id=session_id,
                status="success",
                data=result_data,
                duration_seconds=duration,
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"[{self.agent_name}] Failed after {duration:.1f}s: {e}")
            return AgentResult(
                agent_name=self.agent_name,
                session_id=session_id,
                status="failed",
                data={},
                duration_seconds=duration,
                error=str(e),
            )

    async def _run_foundry(self, context: dict[str, Any], session_id: str) -> dict[str, Any]:
        """Execute via Azure AI Foundry Agent Service (with persistence and threading)."""
        client = self._get_foundry_client()

        # Create or reuse agent
        agent = client.agents.create_agent(
            model=self.model,
            name=f"{self.agent_name}-{session_id[:8]}",
            instructions=self.system_prompt,
            tools=self.get_tools(),
            temperature=self.temperature,
        )
        self._agent_id = agent.id

        try:
            thread: AgentThread = client.agents.create_thread()
            client.agents.create_message(
                thread_id=thread.id,
                role=MessageRole.USER,
                content=self.build_user_message(context),
            )

            run = client.agents.create_and_process_run(
                thread_id=thread.id,
                agent_id=agent.id,
            )

            if run.status == RunStatus.FAILED:
                raise RuntimeError(f"Agent run failed: {run.last_error}")

            # Retrieve final assistant message
            messages = client.agents.list_messages(thread_id=thread.id)
            assistant_messages = [m for m in messages if m.role == MessageRole.AGENT]
            raw_response = assistant_messages[-1].content[0].text.value if assistant_messages else ""

            return self.parse_response(raw_response)

        finally:
            client.agents.delete_agent(agent.id)

    async def _run_direct(self, context: dict[str, Any], session_id: str) -> dict[str, Any]:
        """Execute via direct Azure OpenAI chat completion (lower latency mode)."""
        client = self._get_openai_client()

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": self.build_user_message(context)},
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"},
            ),
        )

        raw_response = response.choices[0].message.content or ""
        return self.parse_response(raw_response)
