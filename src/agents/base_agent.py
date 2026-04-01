"""
Base agent class for all specialized agents.

Execution modes:
  - anthropic  : Uses Anthropic API with Claude claude-opus-4-6 (local/default mode)
  - azure      : Uses Azure OpenAI direct chat completion
  - foundry    : Uses Azure AI Foundry Agent Service (full persistence + threading)

Mode is selected by settings.llm_provider + use_foundry_mode flag.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import yaml

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

    Three execution modes (selected automatically based on settings):
    - Anthropic mode  : Claude claude-opus-4-6 via Anthropic API (local, default)
    - Direct mode     : Azure OpenAI chat completion (lower latency)
    - Foundry mode    : Azure AI Foundry Agent Service (full persistence, threading)
    """

    def __init__(self, use_foundry_mode: bool = False):
        self.settings = get_settings()
        self.use_foundry_mode = use_foundry_mode
        self._prompt_config = self._load_prompt_config()
        self._anthropic_client: Any | None = None
        self._openai_client: Any | None = None
        self._foundry_client: Any | None = None

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
        if self.settings.llm_provider == "anthropic":
            return self.settings.anthropic_model
        return self._prompt_config.get(
            "model", self.settings.azure_openai_deployment_gpt4o
        )

    @property
    def temperature(self) -> float:
        return self._prompt_config.get("temperature", self.settings.agent_temperature)

    @property
    def max_tokens(self) -> int:
        return self._prompt_config.get("max_tokens", self.settings.agent_max_tokens)

    # ── Tool registry (subclasses override; not used in Anthropic mode) ────────
    def get_tools(self) -> list:
        """Return tools for Foundry/Azure modes. Empty in Anthropic local mode."""
        return []

    @abstractmethod
    def build_user_message(self, context: dict[str, Any]) -> str:
        """Build the user message from the analysis context."""

    @abstractmethod
    def parse_response(self, raw_response: str) -> dict[str, Any]:
        """Parse the agent's raw text response into structured data."""

    # ── JSON extraction helper ─────────────────────────────────────────────────
    @staticmethod
    def _extract_json(raw: str) -> str:
        """
        Robustly extract a JSON object or array from Claude/GPT responses.
        Handles: markdown code fences, leading text, trailing commentary.
        """
        raw = raw.strip()

        # 1. Try to strip ```json ... ``` or ``` ... ``` fences
        fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)```", raw)
        if fence_match:
            candidate = fence_match.group(1).strip()
            try:
                json.loads(candidate)
                return candidate
            except json.JSONDecodeError:
                pass

        # 2. Find the first { or [ and extract the balanced JSON block
        for opener, closer in [('{', '}'), ('[', ']')]:
            start = raw.find(opener)
            if start == -1:
                continue
            depth = 0
            in_string = False
            escape_next = False
            for i, ch in enumerate(raw[start:], start):
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\' and in_string:
                    escape_next = True
                    continue
                if ch == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == opener:
                    depth += 1
                elif ch == closer:
                    depth -= 1
                    if depth == 0:
                        candidate = raw[start:i + 1]
                        try:
                            json.loads(candidate)
                            return candidate
                        except json.JSONDecodeError:
                            break  # malformed, try next opener

        # 3. Return raw as-is and let parse_response handle the error
        return raw

    # ── Main entrypoint ────────────────────────────────────────────────────────
    async def run(self, context: dict[str, Any], session_id: str | None = None) -> AgentResult:
        """Execute the agent with the given context."""
        session_id = session_id or str(uuid.uuid4())
        start_time = time.time()

        logger.info(f"[{self.agent_name}] Starting ({self.settings.llm_provider} mode) — session {session_id}")

        try:
            if self.settings.llm_provider == "anthropic":
                result_data = await self._run_anthropic(context, session_id)
            elif self.use_foundry_mode:
                result_data = await self._run_foundry(context, session_id)
            else:
                result_data = await self._run_azure_direct(context, session_id)

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
            logger.error(f"[{self.agent_name}] Failed after {duration:.1f}s: {e}", exc_info=True)
            return AgentResult(
                agent_name=self.agent_name,
                session_id=session_id,
                status="failed",
                data={},
                duration_seconds=duration,
                error=str(e),
            )

    # ── Anthropic mode (local) ─────────────────────────────────────────────────
    def _get_anthropic_client(self) -> Any:
        if self._anthropic_client is None:
            import anthropic  # lazy import
            self._anthropic_client = anthropic.AsyncAnthropic(
                api_key=self.settings.anthropic_api_key or None  # uses ANTHROPIC_API_KEY env var if empty
            )
        return self._anthropic_client

    async def _run_anthropic(self, context: dict[str, Any], session_id: str) -> dict[str, Any]:
        """Execute via Anthropic API (Claude claude-opus-4-6)."""
        import anthropic  # lazy import — ensures clean error if not installed

        client = self._get_anthropic_client()
        system = (
            self.system_prompt
            + "\n\nCRITICAL: You MUST respond with ONLY valid JSON. No markdown, no explanation, no code fences. "
            "Start your response directly with { and end with }."
        )
        user_message = self.build_user_message(context)

        try:
            response = await client.messages.create(
                model=self.settings.anthropic_model,
                max_tokens=self.max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )
        except anthropic.AuthenticationError:
            raise RuntimeError(
                "Anthropic API key invalid or missing. "
                "Set ANTHROPIC_API_KEY in .env or environment."
            )
        except anthropic.RateLimitError:
            raise RuntimeError("Anthropic rate limit hit. Please wait and retry.")

        raw = response.content[0].text
        logger.debug(f"[{self.agent_name}] Raw response length: {len(raw)} chars")
        clean = self._extract_json(raw)
        return self.parse_response(clean)

    # ── Azure Direct mode ──────────────────────────────────────────────────────
    def _get_openai_client(self) -> Any:
        if self._openai_client is None:
            from openai import AzureOpenAI  # lazy import
            from azure.identity import DefaultAzureCredential, get_bearer_token_provider

            kwargs: dict[str, Any] = {
                "azure_endpoint": self.settings.azure_openai_endpoint,
                "api_version": self.settings.azure_openai_api_version,
            }
            if self.settings.azure_openai_api_key:
                kwargs["api_key"] = self.settings.azure_openai_api_key
            else:
                token_provider = get_bearer_token_provider(
                    DefaultAzureCredential(),
                    "https://cognitiveservices.azure.com/.default",
                )
                kwargs["azure_ad_token_provider"] = token_provider
            self._openai_client = AzureOpenAI(**kwargs)
        return self._openai_client

    async def _run_azure_direct(self, context: dict[str, Any], session_id: str) -> dict[str, Any]:
        """Execute via direct Azure OpenAI chat completion."""
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
        raw = response.choices[0].message.content or ""
        return self.parse_response(raw)

    # ── Azure Foundry mode ─────────────────────────────────────────────────────
    def _get_foundry_client(self) -> Any:
        if self._foundry_client is None:
            from azure.ai.projects import AIProjectClient  # lazy import
            from azure.identity import DefaultAzureCredential, ManagedIdentityCredential

            credential = (
                ManagedIdentityCredential()
                if self.settings.use_managed_identity
                else DefaultAzureCredential()
            )
            self._foundry_client = AIProjectClient.from_connection_string(
                conn_str=self.settings.azure_ai_project_connection_string,
                credential=credential,
            )
        return self._foundry_client

    async def _run_foundry(self, context: dict[str, Any], session_id: str) -> dict[str, Any]:
        """Execute via Azure AI Foundry Agent Service (sync SDK wrapped in executor)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._run_foundry_sync, context, session_id)

    def _run_foundry_sync(self, context: dict[str, Any], session_id: str) -> dict[str, Any]:
        """Synchronous Foundry execution (called from thread pool)."""
        from azure.ai.projects.models import MessageRole, RunStatus  # lazy import

        client = self._get_foundry_client()
        agent = client.agents.create_agent(
            model=self.model,
            name=f"{self.agent_name}-{session_id[:8]}",
            instructions=self.system_prompt,
            tools=self.get_tools(),
            temperature=self.temperature,
        )
        try:
            thread = client.agents.create_thread()
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
                raise RuntimeError(f"Foundry agent run failed: {run.last_error}")

            messages = client.agents.list_messages(thread_id=thread.id)
            assistant_messages = [m for m in messages if m.role == MessageRole.AGENT]
            raw = assistant_messages[-1].content[0].text.value if assistant_messages else ""
            return self.parse_response(self._extract_json(raw))
        finally:
            client.agents.delete_agent(agent.id)
