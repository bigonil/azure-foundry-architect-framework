"""
Redis cache layer — two levels:

  1. Report cache  (key: "report:{fingerprint}")
     Full AnalysisReportResponse cached after synthesis.
     Hit = 0 Claude calls, instant response.
     TTL: CACHE_REPORT_TTL_HOURS (default 24h).

  2. Agent cache   (key: "agent:{name}:{fingerprint}")
     Individual AgentResult cached after each agent run.
     Hit = Claude call skipped for that agent only.
     TTL: CACHE_AGENT_TTL_HOURS (default 48h).

If Redis is unavailable the cache silently degrades — analysis runs normally.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Module-level client — initialised once on first use.
_redis_client: Any = None


async def _client():
    """Return a shared async Redis client, creating it on first call."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis.asyncio as aioredis
        from src.config.settings import get_settings
        settings = get_settings()
        _redis_client = aioredis.from_url(
            settings.redis_uri,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
        )
        await _redis_client.ping()
        logger.info("[Cache] Redis connected at %s", settings.redis_uri)
    except Exception as exc:
        logger.warning("[Cache] Redis unavailable — caching disabled: %s", exc)
        _redis_client = None
    return _redis_client


# ── Key builders ──────────────────────────────────────────────────────────────

def _sha256(data: Any) -> str:
    payload = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def report_cache_key(request_dict: dict) -> str:
    """Deterministic fingerprint for a full analysis request."""
    fingerprint = {
        "analysis_types": sorted(request_dict.get("analysis_types", [])),
        "source_cloud": request_dict.get("source_cloud", ""),
        "target_cloud": request_dict.get("target_cloud", ""),
        "additional_context": (request_dict.get("additional_context") or "").strip(),
        "current_monthly_cost_usd": request_dict.get("current_monthly_cost_usd"),
        "code_artifacts": sorted(
            [(a["filename"], a["content"]) for a in request_dict.get("code_artifacts", [])],
            key=lambda t: t[0],
        ),
        "iac_artifacts": sorted(
            [(a["filename"], a["content"]) for a in request_dict.get("iac_artifacts", [])],
            key=lambda t: t[0],
        ),
    }
    return f"report:{_sha256(fingerprint)}"


def agent_cache_key(agent_name: str, context: dict, has_mcp: bool = False) -> str:
    """Deterministic fingerprint for a single agent's inputs.

    ``has_mcp`` differentiates cache entries produced with vs without active MCP
    servers — Phase 1 agents (code_analyzer, infra_analyzer) produce richer output
    when MCP is active, so they must not share cache entries with non-MCP runs.
    """
    fingerprint = {
        "agent": agent_name,
        "source_cloud": context.get("source_cloud", ""),
        "target_cloud": context.get("target_cloud", ""),
        "additional_context": (context.get("additional_context") or "").strip(),
        "has_mcp": has_mcp,
        "code_artifacts": sorted(
            [(a["filename"], a["content"]) for a in context.get("code_artifacts", [])],
            key=lambda t: t[0],
        ),
        "iac_artifacts": sorted(
            [(a["filename"], a["content"]) for a in context.get("iac_artifacts", [])],
            key=lambda t: t[0],
        ),
    }
    return f"agent:{_sha256(fingerprint)}"


# ── Public API ────────────────────────────────────────────────────────────────

async def cache_get(key: str) -> dict | None:
    """Return a cached dict, or None on miss / error."""
    try:
        r = await _client()
        if r is None:
            return None
        raw = await r.get(key)
        if raw is None:
            return None
        logger.info("[Cache] HIT  %s", key[:64])
        return json.loads(raw)
    except Exception as exc:
        logger.warning("[Cache] GET error for %s: %s", key[:64], exc)
        return None


async def cache_set(key: str, value: dict, ttl_seconds: int) -> None:
    """Store a dict in Redis with the given TTL. Silently no-ops on error."""
    try:
        r = await _client()
        if r is None:
            return
        await r.set(key, json.dumps(value, ensure_ascii=False), ex=ttl_seconds)
        logger.info("[Cache] SET  %s  (TTL %ds)", key[:64], ttl_seconds)
    except Exception as exc:
        logger.warning("[Cache] SET error for %s: %s", key[:64], exc)


async def cache_invalidate(key: str) -> None:
    """Delete a single cache entry."""
    try:
        r = await _client()
        if r is None:
            return
        await r.delete(key)
        logger.info("[Cache] DEL  %s", key[:64])
    except Exception as exc:
        logger.warning("[Cache] DEL error for %s: %s", key[:64], exc)
