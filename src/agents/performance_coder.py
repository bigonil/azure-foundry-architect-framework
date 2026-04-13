"""
Performance Coder Agent — Trasformazione del Codice

Scrive il nuovo codice basandosi sullo schema dell'Architetto.
Obiettivo: Seguire le Google Style Guides e garantire che la logica di business sia preservata.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class PerformanceCoderAgent(BaseAgent):
    """
    Il Coder — Scrive il nuovo codice basandosi sullo schema dell'Architetto.
    Segue le Google Style Guides e preserva la logica di business.
    """

    def __init__(self, use_foundry_mode: bool = False):
        super().__init__(use_foundry_mode=use_foundry_mode)

    @property
    def agent_name(self) -> str:
        return "performance_coder"

    def build_user_message(self, context: dict[str, Any]) -> str:
        """Costruisce il prompt per la trasformazione del codice."""
        code_artifacts = context.get("code_artifacts", [])
        architect_analysis = context.get("architect_analysis", {})
        optimizer_feedback = context.get("optimizer_feedback", [])
        project_name = context.get("project_name", "Unknown")
        additional_context = context.get("additional_context", "")

        # Estrai le opportunità di refactoring dall'analisi dell'architetto
        refactoring_opportunities = architect_analysis.get("refactoring_opportunities", [])
        code_smells = architect_analysis.get("code_smells", [])

        # Seleziona i file più grandi per l'analisi (max 30 file per non superare i limiti di token)
        MAX_FILES_TO_ANALYZE = 30
        MAX_CHARS_PER_FILE = 5000  # Limita anche la dimensione di ogni file
        
        # Ordina per dimensione e prendi i più grandi
        sorted_artifacts = sorted(
            code_artifacts, 
            key=lambda a: len(a.get('content', '')), 
            reverse=True
        )[:MAX_FILES_TO_ANALYZE]
        
        # Crea un riassunto degli artifacts
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

        prompt = f"""# Code Transformation — {project_name}

## Project Overview
{artifacts_summary}

## Code Files to Analyze
{file_list}

## Architect Analysis Summary
- Refactoring opportunities found: {len(refactoring_opportunities)}
- Code smells identified: {len(code_smells)}

### Top Refactoring Opportunities
{json.dumps(refactoring_opportunities[:5], indent=2) if refactoring_opportunities else "None"}

### Critical Code Smells
{json.dumps(code_smells[:5], indent=2) if code_smells else "None"}

{f"## Optimizer Feedback (Iteration)\n{json.dumps(optimizer_feedback, indent=2)}" if optimizer_feedback else ""}

{f"## Additional Context\n{additional_context}" if additional_context else ""}

## Your Task
Based on the Architect's analysis and the code files provided above, rewrite the code following the instructions in the system prompt.
Produce COMPLETE, WORKING code files with all optimizations applied.

Return ONLY the JSON object as specified in the system prompt. No markdown, no explanation.
"""
        return prompt

    def parse_response(self, response_text: str) -> dict[str, Any]:
        """Parse della risposta JSON dall'LLM."""
        clean = self._extract_json(response_text)
        try:
            data = json.loads(clean)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse coder response: {e}")
            logger.error(f"Raw response (first 500 chars): {response_text[:500]}")
            return {
                "refactored_files": [],
                "migration_guide": {},
                "style_compliance": {},
                "code_quality_metrics": {},
                "performance_tests": [],
                "error": f"JSON parse error: {str(e)}",
            }

        # Se Claude ha restituito una lista invece di un dict, wrappala
        if isinstance(data, list):
            logger.warning(f"Coder returned a list with {len(data)} items, wrapping in dict structure")
            return {
                "refactored_files": data if all(isinstance(item, dict) for item in data) else [],
                "migration_guide": {},
                "style_compliance": {},
                "code_quality_metrics": {},
                "performance_tests": [],
                "raw_list_response": data,
            }

        # Verifica che il dict abbia le chiavi richieste
        required_keys = ["refactored_files", "migration_guide"]
        
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            logger.warning(f"Coder response missing keys: {missing_keys}")
            # Aggiungi le chiavi mancanti con valori di default
            for key in missing_keys:
                if key == "refactored_files":
                    data[key] = []
                else:
                    data[key] = {}

        return data
