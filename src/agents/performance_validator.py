"""
Performance Validator Agent — Sicurezza e Testing

Esegue analisi statica e genera Unit Test.
Obiettivo: Garantire che il nuovo codice sia sicuro (CERT/OWASP) e senza regressioni.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class PerformanceValidatorAgent(BaseAgent):
    """
    Il Validatore/QA — Esegue analisi statica e genera Unit Test.
    Garantisce sicurezza (CERT/OWASP) e assenza di regressioni funzionali.
    """

    def __init__(self, use_foundry_mode: bool = False):
        super().__init__(use_foundry_mode=use_foundry_mode)

    @property
    def agent_name(self) -> str:
        return "performance_validator"

    def build_user_message(self, context: dict[str, Any]) -> str:
        """Costruisce il prompt per validazione e testing."""
        code_artifacts = context.get("code_artifacts", [])
        refactored_code = context.get("refactored_code", {})
        optimized_code = context.get("optimized_code", {})
        project_name = context.get("project_name", "Unknown")
        additional_context = context.get("additional_context", "")

        # Analizza il codice più recente disponibile
        refactored_files = refactored_code.get("refactored_files", []) if isinstance(refactored_code, dict) else []
        optimized_files = optimized_code.get("refactored_files", []) if isinstance(optimized_code, dict) else []
        
        # Seleziona i file più grandi per l'analisi (max 30 file per non superare i limiti di token)
        MAX_FILES_TO_ANALYZE = 30
        MAX_CHARS_PER_FILE = 5000  # Limita anche la dimensione di ogni file
        
        # Priorità: codice ottimizzato > codice refactorizzato > codice originale
        files_to_analyze = []
        if optimized_files:
            # Usa i file ottimizzati
            for rf in optimized_files:
                for new_file in rf.get("new_files", []):
                    files_to_analyze.append({
                        "filename": new_file.get("path", "unknown"),
                        "content": new_file.get("content", "")
                    })
        elif refactored_files:
            # Usa i file refactorizzati
            for rf in refactored_files:
                for new_file in rf.get("new_files", []):
                    files_to_analyze.append({
                        "filename": new_file.get("path", "unknown"),
                        "content": new_file.get("content", "")
                    })
        else:
            # Usa gli artifacts originali
            files_to_analyze = code_artifacts
        
        # Ordina per dimensione e prendi i più grandi
        sorted_artifacts = sorted(
            files_to_analyze, 
            key=lambda a: len(a.get('content', '')), 
            reverse=True
        )[:MAX_FILES_TO_ANALYZE]
        
        artifacts_summary = f"Total files: {len(code_artifacts)}"
        if code_artifacts:
            by_ext: dict[str, int] = {}
            for artifact in code_artifacts:
                ext = artifact.get("filename", "").split(".")[-1] if "." in artifact.get("filename", "") else "unknown"
                by_ext[ext] = by_ext.get(ext, 0) + 1
            
            ext_summary = ", ".join([f"{count} .{ext}" for ext, count in sorted(by_ext.items(), key=lambda x: -x[1])[:5]])
            artifacts_summary = f"{len(code_artifacts)} files total ({ext_summary}). Analyzing top {len(sorted_artifacts)} largest files."
            
            # Mostra i file selezionati con snippet di codice
            file_list = ""
            for i, artifact in enumerate(sorted_artifacts, 1):
                filename = artifact.get('filename', 'unknown')
                content = artifact.get('content', '')
                # Tronca il contenuto se troppo lungo
                if len(content) > MAX_CHARS_PER_FILE:
                    content = content[:MAX_CHARS_PER_FILE] + f"\n... (truncated, total {len(content)} chars)"
                
                file_list += f"\n### File {i}: {filename} ({len(artifact.get('content', ''))} chars)\n```\n{content}\n```\n"
        else:
            file_list = "No files provided"

        prompt = f"""# Security & Testing Validation — {project_name}

## Project Overview
{artifacts_summary}

{f"## Refactored Code\n{len(refactored_files)} files refactored" if refactored_files else ""}
{f"## Optimized Code\n{len(optimized_files)} files optimized" if optimized_files else ""}

## Code Files to Analyze
{file_list}

{f"## Additional Context\n{additional_context}" if additional_context else ""}

## Your Task
Analyze the code files provided above for security vulnerabilities and generate comprehensive unit tests.
Follow the instructions in the system prompt to identify:
- OWASP Top 10 vulnerabilities
- CERT security standards violations
- Missing input validation
- Hardcoded secrets
- Generate unit tests for critical functions

Return ONLY the JSON object as specified in the system prompt. No markdown, no explanation.
"""
        return prompt

    def parse_response(self, response_text: str) -> dict[str, Any]:
        """Parse della risposta JSON dall'LLM."""
        clean = self._extract_json(response_text)
        try:
            data = json.loads(clean)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse validator response: {e}")
            logger.error(f"Raw response (first 500 chars): {response_text[:500]}")
            return {
                "security_findings": [],
                "code_quality_issues": [],
                "generated_tests": [],
                "integration_test_scenarios": [],
                "regression_test_cases": [],
                "security_score": {},
                "test_coverage_analysis": {},
                "recommendations": [],
                "compliance_checklist": {},
                "error": f"JSON parse error: {str(e)}",
            }

        # Se Claude ha restituito una lista invece di un dict, wrappala
        if isinstance(data, list):
            logger.warning(f"Validator returned a list with {len(data)} items, wrapping in dict structure")
            return {
                "security_findings": data if all(isinstance(item, dict) for item in data) else [],
                "code_quality_issues": [],
                "generated_tests": [],
                "integration_test_scenarios": [],
                "regression_test_cases": [],
                "security_score": {},
                "test_coverage_analysis": {},
                "recommendations": [],
                "compliance_checklist": {},
                "raw_list_response": data,
            }

        # Verifica che il dict abbia le chiavi richieste
        required_keys = ["security_findings", "generated_tests"]
        
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            logger.warning(f"Validator response missing keys: {missing_keys}")
            # Aggiungi le chiavi mancanti con valori di default
            for key in missing_keys:
                if key in ["security_findings", "generated_tests", "recommendations"]:
                    data[key] = []
                else:
                    data[key] = {}

        return data
