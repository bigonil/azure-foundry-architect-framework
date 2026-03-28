"""
Code Analyzer Agent — analyzes application source code repositories.
Detects languages, frameworks, cloud coupling, patterns, and technical debt.
"""
import json
import logging
from pathlib import Path
from typing import Any

from azure.ai.projects.models import CodeInterpreterTool, ToolDefinition

from src.agents.base_agent import BaseAgent
from src.tools.code_scanner import CodeScanner

logger = logging.getLogger(__name__)


class CodeAnalyzerAgent(BaseAgent):
    """Analyzes application source code for cloud migration readiness."""

    @property
    def agent_name(self) -> str:
        return "code_analyzer"

    def get_tools(self) -> list[ToolDefinition]:
        return [CodeInterpreterTool()]

    def build_user_message(self, context: dict[str, Any]) -> str:
        artifacts = context.get("code_artifacts", [])
        source_cloud = context.get("source_cloud", "unknown")
        target_cloud = context.get("target_cloud", "azure")

        # Pre-scan artifacts with local tools for efficiency
        scan_summary = self._pre_scan_artifacts(artifacts)

        return f"""
Analyze this application codebase for cloud migration readiness.

## Migration Context
- Source Cloud: {source_cloud}
- Target Cloud: {target_cloud}
- Project: {context.get('project_name')}

## Pre-Scan Results (from static analysis tools)
{json.dumps(scan_summary, indent=2)}

## Raw Artifacts
{self._format_artifacts(artifacts)}

## Analysis Required
Perform a complete code analysis covering:
1. Technology Inventory (languages, frameworks, versions)
2. Cloud Provider Coupling (SDK usage, hard-coded cloud resources)
3. Architecture Patterns (monolith/microservices/serverless)
4. Technical Debt & Code Quality
5. Containerization & Deployment Readiness (12-factor compliance)
6. Migration Impact Assessment per component

Return a comprehensive CodeAnalysisReport as JSON.
"""

    def _pre_scan_artifacts(self, artifacts: list[dict[str, Any]]) -> dict[str, Any]:
        """Use local static analysis tools before sending to LLM."""
        if not artifacts:
            return {"message": "No code artifacts provided"}

        scanner = CodeScanner()
        detected_languages: set[str] = set()
        detected_frameworks: set[str] = set()
        cloud_sdks: list[str] = []
        file_count = len(artifacts)

        for artifact in artifacts:
            content = artifact.get("content", "")
            filename = artifact.get("filename", "")
            lang = scanner.detect_language(filename)
            if lang:
                detected_languages.add(lang)
            frameworks = scanner.detect_frameworks(content, filename)
            detected_frameworks.update(frameworks)
            sdks = scanner.detect_cloud_sdks(content)
            cloud_sdks.extend(sdks)

        return {
            "file_count": file_count,
            "detected_languages": list(detected_languages),
            "detected_frameworks": list(detected_frameworks),
            "cloud_sdk_references": list(set(cloud_sdks)),
        }

    def _format_artifacts(self, artifacts: list[dict[str, Any]]) -> str:
        if not artifacts:
            return "No code artifacts provided."

        formatted = []
        for artifact in artifacts[:20]:  # Limit to 20 files to stay within token budget
            filename = artifact.get("filename", "unknown")
            content = artifact.get("content", "")
            # Truncate large files
            if len(content) > 3000:
                content = content[:3000] + "\n... [truncated]"
            formatted.append(f"### {filename}\n```\n{content}\n```")

        if len(artifacts) > 20:
            formatted.append(f"\n... and {len(artifacts) - 20} more files")

        return "\n\n".join(formatted)

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            # Normalize to expected schema
            return {
                "technology_inventory": data.get("technology_inventory", {}),
                "cloud_coupling": data.get("cloud_coupling", {}),
                "architecture_patterns": data.get("architecture_patterns", {}),
                "technical_debt": data.get("technical_debt", {}),
                "containerization_readiness": data.get("containerization_readiness", {}),
                "migration_impact": data.get("migration_impact", {}),
                "summary": data.get("summary", ""),
                "coupling_score": data.get("coupling_score", "UNKNOWN"),
                "raw": data,
            }
        except json.JSONDecodeError:
            logger.warning(f"[{self.agent_name}] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}
