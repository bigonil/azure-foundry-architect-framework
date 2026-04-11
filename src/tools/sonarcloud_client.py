"""
SonarCloud REST API client.

Searches for a project by name/key, then fetches:
  - Quality gate status
  - Code metrics (bugs, vulnerabilities, code smells, coverage, debt, …)
  - Top open issues (bugs + vulnerabilities, up to 20)

Auth: token passed as HTTP Basic username with empty password.
Degrades gracefully — returns an error dict if the project is not found
or the API is unreachable.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from src.config.settings import get_settings

logger = logging.getLogger(__name__)

SONARCLOUD_URL = "https://sonarcloud.io"

METRICS = ",".join([
    "bugs",
    "vulnerabilities",
    "code_smells",
    "security_hotspots",
    "coverage",
    "duplicated_lines_density",
    "sqale_index",          # technical debt in minutes
    "reliability_rating",   # A–E
    "security_rating",      # A–E
    "sqale_rating",         # maintainability A–E
    "ncloc",                # lines of code
    "alert_status",         # quality gate OK / ERROR
])

RATING_MAP = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}


def _rating(value: str) -> str:
    return RATING_MAP.get(str(int(float(value))), value) if value else "?"


def _debt_human(minutes_str: str) -> str:
    """Convert sqale_index (minutes) to human-readable string."""
    try:
        mins = int(minutes_str)
        if mins < 60:
            return f"{mins}min"
        hours = mins // 60
        if hours < 8:
            return f"{hours}h"
        days = hours // 8
        return f"{days}d {hours % 8}h"
    except (ValueError, TypeError):
        return minutes_str


class SonarCloudClient:

    def __init__(self) -> None:
        settings = get_settings()
        self._token = settings.sonarcloud_token
        self._org = settings.sonarcloud_org
        self._auth = (self._token, "")  # Basic auth: token as username, empty password

    # ── Public entry point ────────────────────────────────────────────────────

    async def analyze_project(self, project_name: str) -> dict[str, Any]:
        """
        Search for *project_name* in SonarCloud and return full analysis data.
        Returns a dict with an 'error' key if the project is not found / API fails.
        """
        if not self._token:
            return {"error": "SONARCLOUD_TOKEN not configured"}

        async with httpx.AsyncClient(auth=self._auth, timeout=15) as client:
            project_key = await self._find_project(client, project_name)
            if not project_key:
                return {
                    "error": f"Project '{project_name}' not found in SonarCloud "
                             f"(org: {self._org}). "
                             "Ensure the project has been scanned at least once."
                }

            measures_task = self._get_measures(client, project_key)
            qg_task = self._get_quality_gate(client, project_key)
            issues_task = self._get_issues(client, project_key)

            import asyncio
            measures_raw, qg, issues = await asyncio.gather(
                measures_task, qg_task, issues_task, return_exceptions=True
            )

        # Collect errors without crashing
        errors: list[str] = []
        if isinstance(measures_raw, Exception):
            errors.append(f"measures: {measures_raw}")
            measures_raw = {}
        if isinstance(qg, Exception):
            errors.append(f"quality_gate: {qg}")
            qg = {}
        if isinstance(issues, Exception):
            errors.append(f"issues: {issues}")
            issues = []

        return {
            "project_key": project_key,
            "project_name": project_name,
            "project_url": f"{SONARCLOUD_URL}/project/overview?id={project_key}",
            "quality_gate": qg,
            "measures": measures_raw,
            "issues": issues,
            "errors": errors or None,
        }

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _find_project(self, client: httpx.AsyncClient, name: str) -> str | None:
        """
        Search by name similarity. Returns the first matching project key.
        Tries exact key match first, then fuzzy search.
        """
        params: dict[str, Any] = {"q": name, "qualifiers": "TRK", "ps": 10}
        if self._org:
            params["organization"] = self._org

        try:
            resp = await client.get(f"{SONARCLOUD_URL}/api/components/search", params=params)
            resp.raise_for_status()
            components = resp.json().get("components", [])
        except Exception as exc:
            logger.warning("[SonarCloud] Project search failed: %s", exc)
            return None

        if not components:
            logger.info("[SonarCloud] No project found matching '%s'", name)
            return None

        # Prefer exact name match, fall back to first result
        name_lower = name.lower()
        for c in components:
            if c.get("name", "").lower() == name_lower or c.get("key", "").lower() == name_lower:
                logger.info("[SonarCloud] Exact match: %s", c["key"])
                return c["key"]

        key = components[0]["key"]
        logger.info("[SonarCloud] Best match: %s (searched: '%s')", key, name)
        return key

    async def _get_measures(self, client: httpx.AsyncClient, key: str) -> dict[str, Any]:
        resp = await client.get(
            f"{SONARCLOUD_URL}/api/measures/component",
            params={"component": key, "metricKeys": METRICS},
        )
        resp.raise_for_status()
        raw_measures = resp.json().get("component", {}).get("measures", [])

        m: dict[str, Any] = {}
        for item in raw_measures:
            metric = item["metric"]
            value = item.get("value", "")
            if metric in ("reliability_rating", "security_rating", "sqale_rating"):
                m[metric] = _rating(value)
            elif metric == "sqale_index":
                m["technical_debt_minutes"] = int(value) if value else 0
                m["technical_debt"] = _debt_human(value)
            elif metric == "alert_status":
                m["quality_gate_status"] = value  # OK / ERROR / WARN
            elif metric == "coverage":
                m[metric] = float(value) if value else None
            elif metric == "duplicated_lines_density":
                m["duplication_pct"] = float(value) if value else 0.0
            elif metric in ("bugs", "vulnerabilities", "code_smells",
                            "security_hotspots", "ncloc"):
                m[metric] = int(value) if value else 0
            else:
                m[metric] = value

        return m

    async def _get_quality_gate(self, client: httpx.AsyncClient, key: str) -> dict[str, Any]:
        resp = await client.get(
            f"{SONARCLOUD_URL}/api/qualitygates/project_status",
            params={"projectKey": key},
        )
        resp.raise_for_status()
        ps = resp.json().get("projectStatus", {})
        return {
            "status": ps.get("status", "UNKNOWN"),  # OK / ERROR / WARN / NONE
            "conditions": [
                {
                    "metric": c.get("metricKey"),
                    "status": c.get("status"),
                    "actual": c.get("actualValue"),
                    "threshold": c.get("errorThreshold"),
                }
                for c in ps.get("conditions", [])
                if c.get("status") != "OK"  # only show failing conditions
            ],
        }

    async def _get_issues(self, client: httpx.AsyncClient, key: str) -> list[dict[str, Any]]:
        resp = await client.get(
            f"{SONARCLOUD_URL}/api/issues/search",
            params={
                "componentKeys": key,
                "types": "BUG,VULNERABILITY",
                "statuses": "OPEN",
                "severities": "BLOCKER,CRITICAL,MAJOR",
                "ps": 20,
                "s": "SEVERITY",
            },
        )
        resp.raise_for_status()
        return [
            {
                "key": i.get("key"),
                "type": i.get("type"),
                "severity": i.get("severity"),
                "message": i.get("message"),
                "component": i.get("component", "").split(":")[-1],
                "line": i.get("line"),
            }
            for i in resp.json().get("issues", [])
        ]
