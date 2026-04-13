#!/usr/bin/env python3
"""
Test script per l'analisi di performance.
Avvia un'analisi sul repository easytrade già clonato.
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

def start_performance_analysis():
    """Avvia un'analisi di performance sul repository easytrade."""
    
    payload = {
        "project_name": "easytrade-performance-test",
        "source_cloud": "on-premises",
        "target_cloud": "azure",
        "source_config": {
            "type": "github",
            "repo_url": "https://github.com/Dynatrace/easytrade.git",
            "branch": "main",
            "code_folder": "",
            "iac_folder": ""
        },
        "additional_context": "Test completo del sistema di analisi performance con tutti e 4 gli agenti",
        "use_foundry_mode": False
    }
    
    print("🚀 Avvio analisi di performance...")
    print(f"   Repository: {payload['source_config']['repo_url']}")
    print(f"   Branch: {payload['source_config']['branch']}")
    print()
    
    response = requests.post(
        f"{BASE_URL}/api/performance/analyze",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code != 202:
        print(f"❌ Errore: {response.status_code}")
        print(response.text)
        return None
    
    data = response.json()
    session_id = data["session_id"]
    
    print(f"✅ Analisi avviata!")
    print(f"   Session ID: {session_id}")
    print(f"   Status: {data['status']}")
    print()
    
    return session_id

def poll_analysis_status(session_id: str, max_wait_seconds: int = 600):
    """Monitora lo stato dell'analisi."""
    
    print("⏳ Monitoraggio analisi in corso...")
    print()
    
    start_time = time.time()
    last_status = None
    
    while True:
        elapsed = time.time() - start_time
        
        if elapsed > max_wait_seconds:
            print(f"⏰ Timeout dopo {max_wait_seconds} secondi")
            return None
        
        response = requests.get(f"{BASE_URL}/api/performance/{session_id}")
        
        if response.status_code != 200:
            print(f"❌ Errore nel recupero stato: {response.status_code}")
            return None
        
        data = response.json()
        status = data.get("status")
        
        if status != last_status:
            print(f"   [{int(elapsed)}s] Status: {status}")
            last_status = status
        
        if status == "completed":
            print()
            print("✅ Analisi completata!")
            return data
        
        if status == "failed":
            print()
            print(f"❌ Analisi fallita: {data.get('error', 'Unknown error')}")
            return data
        
        time.sleep(5)

def print_report_summary(report: dict):
    """Stampa un riassunto del report."""
    
    print()
    print("=" * 80)
    print("📊 REPORT SUMMARY")
    print("=" * 80)
    print()
    
    # Informazioni generali
    print(f"Project: {report.get('project_name', 'N/A')}")
    print(f"Status: {report.get('status', 'N/A')}")
    print(f"Duration: {report.get('total_duration_seconds', 0):.1f}s")
    print()
    
    # Token e costi
    tokens = report.get('total_tokens', {})
    print(f"Tokens: {tokens.get('input', 0):,} input + {tokens.get('output', 0):,} output")
    print(f"Cost: €{report.get('total_cost_eur', 0):.4f}")
    print()
    
    # Fasi
    phases = report.get('phases', {})
    
    print("📋 PHASES:")
    print()
    
    # Architect
    if 'architect' in phases:
        arch = phases['architect']
        print(f"  1. ARCHITECT ({arch.get('status', 'N/A')})")
        print(f"     Duration: {arch.get('duration_seconds', 0):.1f}s")
        arch_data = arch.get('data', {})
        print(f"     Files analyzed: {arch_data.get('files_analyzed', 0)}")
        print(f"     Functions analyzed: {arch_data.get('total_functions_analyzed', 0)}")
        print(f"     Code smells: {len(arch_data.get('code_smells', []))}")
        print(f"     Refactoring opportunities: {len(arch_data.get('refactoring_opportunities', []))}")
        print()
    
    # Coder
    if 'coder' in phases:
        coder = phases['coder']
        print(f"  2. CODER ({coder.get('status', 'N/A')})")
        print(f"     Duration: {coder.get('duration_seconds', 0):.1f}s")
        coder_data = coder.get('data', {})
        print(f"     Refactored files: {len(coder_data.get('refactored_files', []))}")
        print()
    
    # Optimizer
    if 'optimizer' in phases:
        opt = phases['optimizer']
        print(f"  3. OPTIMIZER ({opt.get('total_iterations', 0)} iterations)")
        iterations = opt.get('iterations', [])
        for i, iteration in enumerate(iterations, 1):
            print(f"     Iteration {i}: {iteration.get('status', 'N/A')} ({iteration.get('duration_seconds', 0):.1f}s)")
        print()
    
    # Validator
    if 'validator' in phases:
        val = phases['validator']
        print(f"  4. VALIDATOR ({val.get('status', 'N/A')})")
        print(f"     Duration: {val.get('duration_seconds', 0):.1f}s")
        val_data = val.get('data', {})
        print(f"     Security findings: {len(val_data.get('security_findings', []))}")
        print(f"     Generated tests: {len(val_data.get('generated_tests', []))}")
        print()
    
    # Executive Summary
    if 'executive_summary' in report:
        summary = report['executive_summary']
        print("📝 EXECUTIVE SUMMARY:")
        print()
        if 'introduzione' in summary:
            intro = summary['introduzione']
            # Stampa solo le prime 3 righe
            lines = intro.split('\n')[:3]
            for line in lines:
                if line.strip():
                    print(f"  {line.strip()}")
        print()
    
    print("=" * 80)
    print()
    print(f"💾 Report completo salvato nel database con session_id: {report.get('session_id', 'N/A')}")
    print()

if __name__ == "__main__":
    # Avvia l'analisi
    session_id = start_performance_analysis()
    
    if not session_id:
        print("❌ Impossibile avviare l'analisi")
        exit(1)
    
    # Monitora lo stato
    report = poll_analysis_status(session_id, max_wait_seconds=600)
    
    if not report:
        print("❌ Impossibile completare l'analisi")
        exit(1)
    
    # Stampa il riassunto
    print_report_summary(report)
    
    print("✅ Test completato con successo!")
