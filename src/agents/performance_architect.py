"""
Performance Architect Agent — Analisi e Manutenibilità del Codice

Analizza il codice legacy (backend, frontend, infra) e crea una mappa delle dipendenze.
Obiettivo: Decidere come rifattorizzare seguendo i principi SOLID.
Output: Schema della nuova struttura (pseudo-codice o JSON).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class PerformanceArchitectAgent(BaseAgent):
    """
    L'Architetto — Analizza il codice legacy e crea una mappa delle dipendenze.
    Decide come rifattorizzare seguendo i principi SOLID.
    """

    def __init__(self, use_foundry_mode: bool = False):
        super().__init__(use_foundry_mode=use_foundry_mode)

    @property
    def agent_name(self) -> str:
        return "performance_architect"

    def build_user_message(self, context: dict[str, Any]) -> str:
        """Costruisce il prompt per l'analisi architettonica."""
        code_artifacts = context.get("code_artifacts", [])
        project_name = context.get("project_name", "Unknown")
        additional_context = context.get("additional_context", "")

        # Crea un riassunto degli artifacts con dettagli sui file
        artifacts_summary = f"Total files: {len(code_artifacts)}"
        
        # Seleziona i file più grandi per l'analisi (max 30 file per non superare i limiti di token)
        MAX_FILES_TO_ANALYZE = 30
        MAX_CHARS_PER_FILE = 5000  # Limita anche la dimensione di ogni file
        
        # Ordina per dimensione e prendi i più grandi
        sorted_artifacts = sorted(
            code_artifacts, 
            key=lambda a: len(a.get('content', '')), 
            reverse=True
        )[:MAX_FILES_TO_ANALYZE]
        
        if code_artifacts:
            # Raggruppa per estensione
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

        prompt = f"""# Performance Architecture Analysis — {project_name}

## Project Overview
{artifacts_summary}

## Code Files to Analyze
{file_list}

{f"## Additional Context\n{additional_context}" if additional_context else ""}

## Your Task
Analyze the provided code files and produce a comprehensive performance analysis report.
Focus on the files provided above and identify:
- Big O complexity for functions in these files
- Memory allocation patterns
- I/O redundancy (N+1 queries, repeated file operations)
- Cache locality issues
- Concrete refactoring opportunities with before/after code

Return ONLY the JSON object as specified in the system prompt. No markdown, no explanation.
"""
        return prompt

    def parse_response(self, response_text: str) -> dict[str, Any]:
        """Parse della risposta JSON dall'LLM."""
        clean = self._extract_json(response_text)
        try:
            data = json.loads(clean)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse architect response: {e}")
            return {
                "files_analyzed": 0,
                "total_functions_analyzed": 0,
                "performance_kpis": {},
                "code_smells": [],
                "refactoring_opportunities": [],
                "error": f"JSON parse error: {str(e)}",
            }

        # Se Claude ha restituito una lista invece di un dict, wrappala
        if isinstance(data, list):
            logger.warning(f"Architect returned a list with {len(data)} items, wrapping in dict structure")
            return {
                "files_analyzed": len(data),
                "total_functions_analyzed": 0,
                "performance_kpis": {},
                "code_smells": data if all(isinstance(item, dict) for item in data) else [],
                "refactoring_opportunities": [],
                "raw_list_response": data,
            }

        # Verifica che il dict abbia le chiavi richieste dal prompt YAML
        required_keys = [
            "files_analyzed",
            "total_functions_analyzed",
            "performance_kpis",
            "code_smells",
            "refactoring_opportunities",
        ]
        
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            logger.warning(f"Architect response missing keys: {missing_keys}")
            # Aggiungi le chiavi mancanti con valori di default
            for key in missing_keys:
                if key in ["code_smells", "refactoring_opportunities"]:
                    data[key] = []
                elif key in ["files_analyzed", "total_functions_analyzed"]:
                    data[key] = 0
                else:
                    data[key] = {}

        return data
