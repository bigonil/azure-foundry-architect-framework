"""
Quality Analyzer Agent — performs static code analysis on application code and IaC
using SonarQube-style rules to detect bugs, vulnerabilities, code smells,
security hotspots, and technical debt across all artifact types.
"""
import json
import logging
from typing import Any


from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SEVERITY_WEIGHTS = {
    "blocker": 5,
    "critical": 4,
    "major": 3,
    "minor": 2,
    "info": 1,
}


class QualityAnalyzerAgent(BaseAgent):

    @property
    def agent_name(self) -> str:
        return "quality_analyzer"

    def get_tools(self) -> list:
        return []  # Uses LLM reasoning over code artifacts

    def build_user_message(self, context: dict[str, Any]) -> str:
        code_artifacts = context.get("code_artifacts", [])
        iac_artifacts = context.get("iac_artifacts", [])
        code_results = context.get("code_analyzer_results", {})
        infra_results = context.get("infra_analyzer_results", {})

        code_summary = ""
        for artifact in code_artifacts[:30]:
            content = artifact.get("content", "")
            code_summary += f"\n### {artifact['filename']}\n```\n{content[:3000]}\n```\n"

        iac_summary = ""
        for artifact in iac_artifacts[:20]:
            content = artifact.get("content", "")
            iac_summary += f"\n### {artifact['filename']}\n```\n{content[:3000]}\n```\n"

        return f"""
Perform a comprehensive static code quality analysis (SonarQube-level) on ALL provided
artifacts — both application code AND Infrastructure as Code.

## Context
- Project: {context.get('project_name')}
- Source Cloud: {context.get('source_cloud', 'unknown')}
- Target Cloud: {context.get('target_cloud', 'azure')}
- Languages detected: {json.dumps(code_results.get('technology_inventory', {}).get('languages', []))}
- IaC format: {infra_results.get('iac_format', 'unknown')}

## Application Code Artifacts
{code_summary if code_summary else 'No application code artifacts provided.'}

## Infrastructure as Code Artifacts
{iac_summary if iac_summary else 'No IaC artifacts provided.'}

## Analysis Required

### 1. Bugs
Identify logic errors, null dereferences, resource leaks, race conditions,
incorrect API usage, off-by-one errors, unhandled exceptions.

### 2. Vulnerabilities
Detect OWASP Top 10 issues: SQL injection, XSS, SSRF, hardcoded secrets,
insecure crypto, path traversal, insecure deserialization, broken auth.
For IaC: overly permissive IAM, public endpoints without WAF, unencrypted
storage, missing audit logging.

### 3. Code Smells
Find duplicated code, long methods, high cyclomatic complexity, deep nesting,
unused imports/variables, magic numbers, God classes, inconsistent naming.
For IaC: repeated resource blocks, hardcoded values instead of variables,
missing tags, no modularization.

### 4. Security Hotspots
Flag code that requires manual security review: CORS configuration, auth
middleware, token handling, file upload endpoints, dynamic SQL construction.
For IaC: network security group rules, firewall exceptions, public IP
assignments, service endpoint configurations.

### 5. Coverage & Duplication Estimation
Estimate test coverage indicators and code duplication percentage based on
patterns observed (test files present, assertion patterns, copy-paste blocks).

### 6. Technical Debt
Calculate total technical debt in person-hours. Classify remediation effort
per issue as: trivial (< 15min), easy (< 1h), medium (< 4h), hard (< 1d), complex (> 1d).

### 7. Quality Gate Assessment
Apply a quality gate with these conditions:
- No blocker or critical bugs
- No critical vulnerabilities
- Coverage >= 60% (estimated)
- Duplication < 5%
- Maintainability rating >= B

Return the result as PASSED or FAILED with reasons.

## Output Format
Return JSON with this structure:
{{
  "quality_gate": {{
    "status": "PASSED|FAILED",
    "conditions": [
      {{"metric": "<metric>", "operator": "<op>", "threshold": "<value>", "actual": "<value>", "status": "OK|ERROR"}}
    ]
  }},
  "summary": {{
    "bugs": <count>,
    "vulnerabilities": <count>,
    "code_smells": <count>,
    "security_hotspots": <count>,
    "estimated_coverage_pct": <number>,
    "duplication_pct": <number>,
    "technical_debt_hours": <number>,
    "reliability_rating": "A-E",
    "security_rating": "A-E",
    "maintainability_rating": "A-E",
    "lines_analyzed": <number>
  }},
  "issues": [
    {{
      "type": "BUG|VULNERABILITY|CODE_SMELL|SECURITY_HOTSPOT",
      "severity": "BLOCKER|CRITICAL|MAJOR|MINOR|INFO",
      "file": "<filename>",
      "line": <line_number>,
      "message": "<description>",
      "rule": "<rule_id e.g. python:S1172>",
      "effort": "<remediation effort>",
      "is_iac": <true|false>
    }}
  ],
  "coverage_by_module": [
    {{"module": "<path>", "coverage_pct": <number>, "lines": <number>}}
  ],
  "top_recommendations": [
    "<actionable recommendation>"
  ]
}}
"""

    def parse_response(self, raw_response: str) -> dict[str, Any]:
        try:
            data = json.loads(raw_response)
            summary = data.get("summary", {})

            return {
                "quality_gate": data.get("quality_gate", {}),
                "summary": summary,
                "issues": data.get("issues", []),
                "coverage_by_module": data.get("coverage_by_module", []),
                "top_recommendations": data.get("top_recommendations", []),
                "total_issues": (
                    summary.get("bugs", 0)
                    + summary.get("vulnerabilities", 0)
                    + summary.get("code_smells", 0)
                    + summary.get("security_hotspots", 0)
                ),
                "reliability_rating": summary.get("reliability_rating", "C"),
                "security_rating": summary.get("security_rating", "C"),
                "maintainability_rating": summary.get("maintainability_rating", "C"),
            }
        except json.JSONDecodeError:
            logger.warning(f"[{self.agent_name}] Could not parse JSON response")
            return {"raw_text": raw_response, "parse_error": True}
