"""
Performance Optimizer Agent — Ottimizzazione Performance

Analizza il codice prodotto dal Coder cercando colli di bottiglia e ottimizzazioni.
Obiettivo: Ottimizzare complessità algoritmica, strutture dati, e uso della memoria.
Metodo: Loop di feedback sul Coder finché i parametri di performance sono soddisfatti.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from src.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class PerformanceOptimizerAgent(BaseAgent):
    """
    L'Ottimizzatore — Analizza il codice per performance e ottimizzazioni.
    Cerca colli di bottiglia, suggerisce strutture dati più efficienti,
    ottimizza l'uso della memoria.
    """

    def __init__(self, use_foundry_mode: bool = False):
        super().__init__(use_foundry_mode=use_foundry_mode)

    @property
    def agent_name(self) -> str:
        return "performance_optimizer"

    def build_user_message(self, context: dict[str, Any]) -> str:
        """Costruisce il prompt per l'ottimizzazione delle performance."""
        code_artifacts = context.get("code_artifacts", [])
        refactored_code = context.get("refactored_code", {})
        optimization_analysis = context.get("optimization_analysis", {})
        project_name = context.get("project_name", "Unknown")
        additional_context = context.get("additional_context", "")

        # Se abbiamo codice refactorizzato, analizziamo quello
        refactored_files = refactored_code.get("refactored_files", [])
        
        # Seleziona i file più grandi per l'analisi (max 30 file per non superare i limiti di token)
        MAX_FILES_TO_ANALYZE = 30
        MAX_CHARS_PER_FILE = 5000  # Limita anche la dimensione di ogni file
        
        # Se abbiamo codice refactorizzato, usa quello; altrimenti usa gli artifacts originali
        files_to_analyze = []
        if refactored_files:
            # Usa i file refactorizzati dal Coder
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

        prompt = f"""# Performance Optimization Analysis — {project_name}

## Project Overview
{artifacts_summary}

{f"## Refactored Code Summary\n{len(refactored_files)} files have been refactored" if refactored_files else "## Analyzing Original Code"}

## Code Files to Analyze
{file_list}

{f"## Previous Optimization Analysis\n{json.dumps(optimization_analysis, indent=2)[:500]}..." if optimization_analysis else ""}

{f"## Additional Context\n{additional_context}" if additional_context else ""}

## Your Task
Analyze the code files provided above for performance bottlenecks and optimization opportunities.
Follow the instructions in the system prompt to identify:
- Big O complexity issues
- Memory allocation problems
- I/O inefficiencies
- Data structure optimizations
- Concrete improvements with measurable impact

Return ONLY the JSON object as specified in the system prompt. No markdown, no explanation.
"""
        return prompt

    def parse_response(self, response_text: str) -> dict[str, Any]:
        """Parse della risposta JSON dall'LLM."""
        clean = self._extract_json(response_text)
        try:
            data = json.loads(clean)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse optimizer response: {e}")
            logger.error(f"Raw response (first 500 chars): {response_text[:500]}")
            return {
                "performance_analysis": [],
                "data_structure_optimizations": [],
                "memory_optimizations": [],
                "io_optimizations": [],
                "concurrency_opportunities": [],
                "caching_opportunities": [],
                "optimization_summary": {},
                "quick_wins": [],
                "performance_targets": {},
                "feedback_for_coder": [],
                "error": f"JSON parse error: {str(e)}",
            }

        # Se Claude ha restituito una lista invece di un dict, wrappala
        if isinstance(data, list):
            logger.warning(f"Optimizer returned a list with {len(data)} items, wrapping in dict structure")
            return {
                "performance_analysis": data if all(isinstance(item, dict) for item in data) else [],
                "data_structure_optimizations": [],
                "memory_optimizations": [],
                "io_optimizations": [],
                "concurrency_opportunities": [],
                "caching_opportunities": [],
                "optimization_summary": {},
                "quick_wins": [],
                "performance_targets": {},
                "feedback_for_coder": [],
                "raw_list_response": data,
            }

        # Verifica che il dict abbia le chiavi richieste
        required_keys = ["performance_analysis", "optimization_summary", "feedback_for_coder"]
        
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            logger.warning(f"Optimizer response missing keys: {missing_keys}")
            # Aggiungi le chiavi mancanti con valori di default
            for key in missing_keys:
                if key in ["performance_analysis", "feedback_for_coder", "quick_wins"]:
                    data[key] = []
                else:
                    data[key] = {}

        return data
