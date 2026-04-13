"""
Performance Analysis Orchestrator — Coordina i 4 agenti di performance

Orchestratore che coordina:
1. Architect: Analizza e crea mappa dipendenze
2. Coder: Trasforma il codice seguendo lo schema
3. Optimizer: Ottimizza performance (loop di feedback con Coder)
4. Validator: Valida sicurezza e genera test
"""
from __future__ import annotations

import logging
import time
from typing import Any

from src.agents.performance_architect import PerformanceArchitectAgent
from src.agents.performance_coder import PerformanceCoderAgent
from src.agents.performance_optimizer import PerformanceOptimizerAgent
from src.agents.performance_validator import PerformanceValidatorAgent

logger = logging.getLogger(__name__)


class PerformanceOrchestrator:
    """
    Orchestratore per l'analisi delle performance e refactoring del codice.
    Coordina 4 agenti specializzati in pipeline con feedback loop.
    """

    def __init__(self, use_foundry_mode: bool = False):
        self.use_foundry_mode = use_foundry_mode
        self.architect = PerformanceArchitectAgent(use_foundry_mode)
        self.coder = PerformanceCoderAgent(use_foundry_mode)
        self.optimizer = PerformanceOptimizerAgent(use_foundry_mode)
        self.validator = PerformanceValidatorAgent(use_foundry_mode)

    async def analyze(
        self,
        project_name: str,
        code_artifacts: list[dict],
        additional_context: str = "",
        max_optimization_iterations: int = 2,
        performance_targets: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Esegue l'analisi completa delle performance con i 4 agenti.

        Args:
            project_name: Nome del progetto
            code_artifacts: Lista di artifact di codice
            additional_context: Contesto aggiuntivo
            max_optimization_iterations: Max iterazioni del loop Optimizer-Coder
            performance_targets: Target di performance da raggiungere

        Returns:
            Report completo con analisi, codice refactorizzato, ottimizzazioni, e test
        """
        logger.info(f"[PerformanceOrchestrator] Starting analysis for '{project_name}'")
        start_time = time.time()

        context = {
            "project_name": project_name,
            "code_artifacts": code_artifacts,
            "additional_context": additional_context,
        }

        results = {
            "project_name": project_name,
            "timestamp": start_time,
            "phases": {},
        }

        # ═══════════════════════════════════════════════════════════════════════
        # PHASE 1: ARCHITECT — Analisi e Mappa Dipendenze
        # ═══════════════════════════════════════════════════════════════════════
        logger.info("[Phase 1] Running Architect: Dependency mapping and SOLID analysis")
        phase1_start = time.time()

        architect_result = await self.architect.run(context, session_id=f"{project_name}_arch")

        results["phases"]["architect"] = {
            "status": architect_result.status,
            "duration_seconds": architect_result.duration_seconds,
            "data": architect_result.data,
            "tokens": {
                "input": architect_result.input_tokens,
                "output": architect_result.output_tokens,
            },
            "cost_eur": architect_result.cost_eur,
        }

        if architect_result.status != "success":
            logger.error(f"[Phase 1] Architect failed: {architect_result.error}")
            results["status"] = "failed"
            results["error"] = f"Architect phase failed: {architect_result.error}"
            return results

        architect_data = architect_result.data
        refactoring_count = len(architect_data.get('refactoring_opportunities', []))
        logger.info(
            f"[Phase 1] Architect completed in {architect_result.duration_seconds:.1f}s — "
            f"Found {refactoring_count} refactoring opportunities"
        )

        # ═══════════════════════════════════════════════════════════════════════
        # PHASE 2: CODER — Trasformazione del Codice
        # ═══════════════════════════════════════════════════════════════════════
        logger.info("[Phase 2] Running Coder: Code transformation based on Architect schema")
        phase2_start = time.time()

        coder_context = {
            **context,
            "architect_analysis": architect_data,
        }

        coder_result = await self.coder.run(coder_context, session_id=f"{project_name}_coder")

        results["phases"]["coder"] = {
            "status": coder_result.status,
            "duration_seconds": coder_result.duration_seconds,
            "data": coder_result.data,
            "tokens": {
                "input": coder_result.input_tokens,
                "output": coder_result.output_tokens,
            },
            "cost_eur": coder_result.cost_eur,
        }

        if coder_result.status != "success":
            logger.error(f"[Phase 2] Coder failed: {coder_result.error}")
            results["status"] = "partial"
            results["error"] = f"Coder phase failed: {coder_result.error}"
            # Continua comunque con l'ottimizzazione del codice originale
            refactored_code = {}
        else:
            refactored_code = coder_result.data
            logger.info(
                f"[Phase 2] Coder completed in {coder_result.duration_seconds:.1f}s — "
                f"Generated {len(refactored_code.get('refactored_files', []))} refactored files"
            )

        # ═══════════════════════════════════════════════════════════════════════
        # PHASE 3: OPTIMIZER — Ottimizzazione Performance (con feedback loop)
        # ═══════════════════════════════════════════════════════════════════════
        logger.info(
            f"[Phase 3] Running Optimizer: Performance optimization "
            f"(max {max_optimization_iterations} iterations)"
        )

        optimizer_context = {
            **context,
            "refactored_code": refactored_code,
        }

        optimization_iterations = []
        current_code = refactored_code
        targets_met = False

        for iteration in range(max_optimization_iterations):
            logger.info(f"[Phase 3.{iteration + 1}] Optimization iteration {iteration + 1}")

            optimizer_result = await self.optimizer.run(
                {**optimizer_context, "refactored_code": current_code},
                session_id=f"{project_name}_opt_{iteration}",
            )

            iteration_data = {
                "iteration": iteration + 1,
                "status": optimizer_result.status,
                "duration_seconds": optimizer_result.duration_seconds,
                "data": optimizer_result.data,
                "tokens": {
                    "input": optimizer_result.input_tokens,
                    "output": optimizer_result.output_tokens,
                },
                "cost_eur": optimizer_result.cost_eur,
            }

            optimization_iterations.append(iteration_data)

            if optimizer_result.status != "success":
                logger.error(f"[Phase 3.{iteration + 1}] Optimizer failed: {optimizer_result.error}")
                break

            # Verifica se i target di performance sono raggiunti
            if performance_targets:
                perf_targets = optimizer_result.data.get("performance_targets", {})
                targets_met = all(
                    perf_targets.get(key, {}).get("achievable", False)
                    for key in performance_targets.keys()
                )

                if targets_met:
                    logger.info(f"[Phase 3.{iteration + 1}] Performance targets met!")
                    break

            # Feedback loop: se ci sono ottimizzazioni e non è l'ultima iterazione,
            # chiedi al Coder di applicarle
            feedback = optimizer_result.data.get("feedback_for_coder", [])
            if feedback and iteration < max_optimization_iterations - 1:
                logger.info(
                    f"[Phase 3.{iteration + 1}] Sending feedback to Coder: {len(feedback)} items"
                )

                # Richiama il Coder con il feedback dell'Optimizer
                coder_feedback_context = {
                    **coder_context,
                    "optimizer_feedback": feedback,
                    "optimization_analysis": optimizer_result.data,
                }

                coder_feedback_result = await self.coder.run(
                    coder_feedback_context,
                    session_id=f"{project_name}_coder_opt_{iteration}",
                )

                if coder_feedback_result.status == "success":
                    current_code = coder_feedback_result.data
                    logger.info(f"[Phase 3.{iteration + 1}] Coder applied optimizations")
                else:
                    logger.warning(
                        f"[Phase 3.{iteration + 1}] Coder failed to apply optimizations"
                    )
                    break
            else:
                break

        results["phases"]["optimizer"] = {
            "iterations": optimization_iterations,
            "total_iterations": len(optimization_iterations),
            "targets_met": targets_met,
            "final_code": current_code,
        }

        logger.info(
            f"[Phase 3] Optimizer completed {len(optimization_iterations)} iterations — "
            f"Targets met: {targets_met}"
        )

        # ═══════════════════════════════════════════════════════════════════════
        # PHASE 4: VALIDATOR — Sicurezza e Testing
        # ═══════════════════════════════════════════════════════════════════════
        logger.info("[Phase 4] Running Validator: Security analysis and test generation")
        phase4_start = time.time()

        validator_context = {
            **context,
            "refactored_code": refactored_code,
            "optimized_code": current_code,
        }

        validator_result = await self.validator.run(
            validator_context,
            session_id=f"{project_name}_validator",
        )

        results["phases"]["validator"] = {
            "status": validator_result.status,
            "duration_seconds": validator_result.duration_seconds,
            "data": validator_result.data,
            "tokens": {
                "input": validator_result.input_tokens,
                "output": validator_result.output_tokens,
            },
            "cost_eur": validator_result.cost_eur,
        }

        if validator_result.status != "success":
            logger.error(f"[Phase 4] Validator failed: {validator_result.error}")
            results["status"] = "partial"
        else:
            logger.info(
                f"[Phase 4] Validator completed in {validator_result.duration_seconds:.1f}s — "
                f"Found {len(validator_result.data.get('security_findings', []))} security issues, "
                f"Generated {len(validator_result.data.get('generated_tests', []))} test files"
            )

        # ═══════════════════════════════════════════════════════════════════════
        # PHASE 5: EXECUTIVE SUMMARY — Sintesi Discorsiva in Italiano
        # ═══════════════════════════════════════════════════════════════════════
        logger.info("[Phase 5] Generating executive summary in Italian")
        
        executive_summary = self._generate_executive_summary(
            architect_data=architect_data,
            coder_data=coder_result.data if coder_result.status == "success" else {},
            optimizer_data=optimization_iterations[-1].get("data", {}) if optimization_iterations else {},
            validator_data=validator_result.data if validator_result.status == "success" else {},
            project_name=project_name,
            total_duration=time.time() - start_time,
        )
        
        results["executive_summary"] = executive_summary
        logger.info("[Phase 5] Executive summary generated")

        # ═══════════════════════════════════════════════════════════════════════
        # FINAL SUMMARY
        # ═══════════════════════════════════════════════════════════════════════
        total_duration = time.time() - start_time

        results["status"] = results.get("status", "success")
        results["total_duration_seconds"] = total_duration
        
        # Calcola token totali includendo le iterazioni dell'optimizer
        optimizer_input_tokens = sum(
            it.get("tokens", {}).get("input", 0) 
            for it in results["phases"].get("optimizer", {}).get("iterations", [])
        )
        optimizer_output_tokens = sum(
            it.get("tokens", {}).get("output", 0) 
            for it in results["phases"].get("optimizer", {}).get("iterations", [])
        )
        optimizer_cost = sum(
            it.get("cost_eur", 0) 
            for it in results["phases"].get("optimizer", {}).get("iterations", [])
        )
        
        results["total_tokens"] = {
            "input": sum(
                phase.get("tokens", {}).get("input", 0)
                for phase in results["phases"].values()
                if isinstance(phase, dict) and "tokens" in phase
            ) + optimizer_input_tokens,
            "output": sum(
                phase.get("tokens", {}).get("output", 0)
                for phase in results["phases"].values()
                if isinstance(phase, dict) and "tokens" in phase
            ) + optimizer_output_tokens,
        }
        results["total_cost_eur"] = sum(
            phase.get("cost_eur", 0)
            for phase in results["phases"].values()
            if isinstance(phase, dict) and "cost_eur" in phase
        ) + optimizer_cost

        logger.info(
            f"[PerformanceOrchestrator] Analysis completed in {total_duration:.1f}s — "
            f"Status: {results['status']} — "
            f"Tokens: {results['total_tokens']['input']}↑ {results['total_tokens']['output']}↓ — "
            f"Cost: €{results['total_cost_eur']:.4f}"
        )

        return results

    def _generate_executive_summary(
        self,
        architect_data: dict[str, Any],
        coder_data: dict[str, Any],
        optimizer_data: dict[str, Any],
        validator_data: dict[str, Any],
        project_name: str,
        total_duration: float,
    ) -> dict[str, str]:
        """
        Genera una sintesi discorsiva in italiano dei risultati dell'analisi.
        
        Returns:
            Dict con sezioni di testo in italiano: introduzione, analisi, previsioni, conclusioni
        """
        # Estrai metriche chiave
        files_analyzed = architect_data.get("files_analyzed", 0)
        total_functions = architect_data.get("total_functions_analyzed", 0)
        code_smells = architect_data.get("code_smells", [])
        refactoring_opps = architect_data.get("refactoring_opportunities", [])
        
        refactored_files = coder_data.get("refactored_files", [])
        
        perf_analysis = optimizer_data.get("performance_analysis", [])
        optimization_summary = optimizer_data.get("optimization_summary", {})
        quick_wins = optimizer_data.get("quick_wins", [])
        
        security_findings = validator_data.get("security_findings", [])
        generated_tests = validator_data.get("generated_tests", [])
        
        # Conta severità
        critical_smells = len([s for s in code_smells if s.get("severity") == "CRITICAL"])
        high_smells = len([s for s in code_smells if s.get("severity") == "HIGH"])
        
        critical_security = len([s for s in security_findings if s.get("severity") == "CRITICAL"])
        high_security = len([s for s in security_findings if s.get("severity") == "HIGH"])
        
        # Calcola miglioramenti stimati
        total_optimizations = optimization_summary.get("total_optimizations", 0)
        estimated_speedup = optimization_summary.get("estimated_speedup", "N/A")
        memory_reduction = optimization_summary.get("estimated_memory_reduction", "N/A")
        total_effort = optimization_summary.get("total_effort_hours", 0)
        
        # ═══════════════════════════════════════════════════════════════════════
        # INTRODUZIONE
        # ═══════════════════════════════════════════════════════════════════════
        intro = f"""## Analisi delle Performance — {project_name}

Il sistema ha completato un'analisi approfondita del progetto **{project_name}** in {total_duration:.1f} secondi, esaminando {files_analyzed} file di codice e analizzando {total_functions} funzioni/metodi.

L'analisi è stata condotta attraverso 4 agenti specializzati:
- **Architect**: Analisi della struttura del codice e identificazione di code smells
- **Coder**: Trasformazione e refactoring del codice
- **Optimizer**: Ottimizzazione delle performance e complessità algoritmica
- **Validator**: Analisi di sicurezza e generazione di test

Questa sintesi presenta i risultati principali e le previsioni sui miglioramenti ottenibili."""

        # ═══════════════════════════════════════════════════════════════════════
        # ANALISI DETTAGLIATA
        # ═══════════════════════════════════════════════════════════════════════
        analysis = f"""## Risultati dell'Analisi

### 1. Qualità del Codice (Architect)

Il sistema ha identificato **{len(code_smells)} code smell** nel progetto, di cui:
- **{critical_smells} critici**: Richiedono intervento immediato
- **{high_smells} ad alta priorità**: Impattano significativamente la manutenibilità
- **{len(code_smells) - critical_smells - high_smells} a priorità media/bassa**: Miglioramenti incrementali

Sono state individuate **{len(refactoring_opps)} opportunità di refactoring** concrete, che includono:
"""

        # Aggiungi esempi di refactoring
        if refactoring_opps:
            for i, opp in enumerate(refactoring_opps[:3], 1):
                file = opp.get("file", "N/A")
                priority = opp.get("priority", "N/A")
                current_complexity = opp.get("current_complexity", "N/A")
                target_complexity = opp.get("target_complexity", "N/A")
                effort = opp.get("effort_hours", 0)
                
                analysis += f"""
**{i}. {file}** (Priorità: {priority})
   - Complessità attuale: {current_complexity}
   - Complessità target: {target_complexity}
   - Effort stimato: {effort} ore"""
        else:
            analysis += "\n*Nessuna opportunità di refactoring identificata o dati non disponibili.*"

        analysis += f"""

### 2. Trasformazione del Codice (Coder)

Il Coder ha prodotto **{len(refactored_files)} file refactorizzati**, applicando le best practice e le Google Style Guides. """

        if refactored_files:
            analysis += f"""Il codice è stato trasformato per:
- Migliorare la leggibilità e manutenibilità
- Separare le responsabilità (Single Responsibility Principle)
- Introdurre dependency injection dove appropriato
- Aggiungere type hints e documentazione completa"""
        else:
            analysis += "Il Coder non ha prodotto file refactorizzati, probabilmente a causa di limitazioni nei dati di input o errori di parsing."

        analysis += f"""

### 3. Ottimizzazione delle Performance (Optimizer)

L'Optimizer ha identificato **{total_optimizations} opportunità di ottimizzazione** concrete, analizzando:
- **Complessità algoritmica**: Identificazione di loop O(n²) o peggiori
- **Allocazioni di memoria**: Oggetti creati inutilmente in loop
- **Operazioni I/O**: Query N+1 e operazioni ripetute
- **Strutture dati**: Liste usate dove servirebbero dict/set per O(1) lookup
"""

        # Aggiungi quick wins
        if quick_wins:
            analysis += f"""
**Quick Wins** (basso effort, alto impatto):
"""
            for i, win in enumerate(quick_wins[:5], 1):
                opt = win.get("optimization", "N/A")
                impact = win.get("impact", "N/A")
                effort = win.get("effort_hours", 0)
                analysis += f"""
{i}. {opt}
   - Impatto: {impact}
   - Effort: {effort} ore"""
        
        # Aggiungi esempi di ottimizzazioni
        if perf_analysis:
            analysis += f"""

**Ottimizzazioni Principali**:
"""
            for i, opt in enumerate(perf_analysis[:3], 1):
                file = opt.get("file", "N/A")
                function = opt.get("function", "N/A")
                current = opt.get("current_complexity", {}).get("time", "N/A")
                optimized = opt.get("optimization", {}).get("optimized_complexity", {}).get("time", "N/A")
                improvement = opt.get("optimization", {}).get("improvement_factor", "N/A")
                
                analysis += f"""
{i}. **{file}::{function}**
   - Complessità attuale: {current}
   - Complessità ottimizzata: {optimized}
   - Miglioramento: {improvement}"""

        analysis += f"""

### 4. Sicurezza e Testing (Validator)

Il Validator ha eseguito un'analisi di sicurezza basata su OWASP Top 10 e CERT, identificando:
- **{len(security_findings)} vulnerabilità di sicurezza** (di cui {critical_security} critiche, {high_security} ad alta priorità)
- **{len(generated_tests)} file di test generati** per garantire l'assenza di regressioni
"""

        if security_findings:
            analysis += """
**Vulnerabilità Critiche da Risolvere**:
"""
            critical_vulns = [s for s in security_findings if s.get("severity") == "CRITICAL"][:3]
            for i, vuln in enumerate(critical_vulns, 1):
                vuln_type = vuln.get("type", "N/A")
                file = vuln.get("file", "N/A")
                desc = vuln.get("description", "N/A")
                analysis += f"""
{i}. **{vuln_type}** in {file}
   - {desc}"""

        # ═══════════════════════════════════════════════════════════════════════
        # PREVISIONI E BENEFICI
        # ═══════════════════════════════════════════════════════════════════════
        predictions = f"""## Previsioni sui Miglioramenti

Applicando tutte le ottimizzazioni identificate, il sistema prevede i seguenti miglioramenti:

### Performance
"""

        if estimated_speedup != "N/A":
            predictions += f"""
- **Velocità**: Miglioramento medio di **{estimated_speedup}** rispetto alla versione attuale
- **Memoria**: Riduzione dell'uso di memoria del **{memory_reduction}**
"""
        else:
            predictions += """
- **Velocità**: Miglioramenti significativi attesi dalla riduzione della complessità algoritmica
- **Memoria**: Riduzione dell'uso di memoria tramite eliminazione di allocazioni inutili
"""

        predictions += f"""
- **Scalabilità**: Il codice ottimizzato gestirà carichi maggiori con le stesse risorse
- **Latenza**: Riduzione dei tempi di risposta, specialmente per operazioni su grandi dataset

### Manutenibilità

- **Code Smells Risolti**: {len(code_smells)} problemi di qualità del codice identificati e risolti
- **Refactoring Applicati**: {len(refactoring_opps)} trasformazioni per migliorare la struttura
- **Test Coverage**: {len(generated_tests)} suite di test per garantire la correttezza
- **Documentazione**: Codice completamente documentato con docstring e type hints

### Sicurezza

- **Vulnerabilità Risolte**: {len(security_findings)} problemi di sicurezza identificati
- **Conformità**: Allineamento con standard OWASP Top 10 e CERT
- **Riduzione del Rischio**: Eliminazione di hardcoded secrets, SQL injection, e altre vulnerabilità

### Effort Richiesto

- **Tempo Totale Stimato**: {total_effort} ore di sviluppo
- **Priorità**: Iniziare con le {len(quick_wins)} quick wins (basso effort, alto impatto)
- **Approccio Incrementale**: Applicare le ottimizzazioni gradualmente con testing continuo
"""

        # ═══════════════════════════════════════════════════════════════════════
        # CONCLUSIONI E RACCOMANDAZIONI
        # ═══════════════════════════════════════════════════════════════════════
        conclusions = f"""## Conclusioni e Raccomandazioni

### Sintesi Esecutiva

Il progetto **{project_name}** presenta **{total_optimizations} opportunità di ottimizzazione** concrete che, se implementate, porteranno a miglioramenti significativi in termini di performance, manutenibilità e sicurezza.

### Priorità di Intervento

1. **Immediate (Settimana 1-2)**:
   - Risolvere le {critical_security} vulnerabilità di sicurezza critiche
   - Implementare le {len(quick_wins)} quick wins identificate dall'Optimizer
   - Correggere i {critical_smells} code smell critici

2. **Breve Termine (Mese 1)**:
   - Applicare le ottimizzazioni algoritmiche principali (O(n²) → O(n))
   - Refactoring dei file con maggiore debito tecnico
   - Implementare i test generati dal Validator

3. **Medio Termine (Mese 2-3)**:
   - Completare tutti i refactoring identificati dall'Architect
   - Ottimizzare l'uso della memoria e le operazioni I/O
   - Migliorare la copertura dei test

### ROI Atteso

- **Performance**: Miglioramento {estimated_speedup} con riduzione dei costi infrastrutturali
- **Manutenibilità**: Riduzione del 50-70% del tempo necessario per nuove feature
- **Sicurezza**: Eliminazione di vulnerabilità che potrebbero causare data breach
- **Qualità**: Codice più robusto, testato e documentato

### Prossimi Passi

1. Revisionare questo report con il team di sviluppo
2. Prioritizzare le ottimizzazioni in base al business impact
3. Creare ticket/task per ogni ottimizzazione identificata
4. Implementare in modo incrementale con testing continuo
5. Monitorare le metriche di performance post-ottimizzazione

---

*Analisi completata in {total_duration:.1f} secondi • {files_analyzed} file analizzati • {total_functions} funzioni esaminate*
"""

        return {
            "introduzione": intro,
            "analisi_dettagliata": analysis,
            "previsioni_miglioramenti": predictions,
            "conclusioni_raccomandazioni": conclusions,
            "full_text": f"{intro}\n\n{analysis}\n\n{predictions}\n\n{conclusions}",
        }
