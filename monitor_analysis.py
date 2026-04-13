#!/usr/bin/env python3
"""Monitor performance analysis progress."""
import requests
import time
import sys

SESSION_ID = "perf_1776062917419"
BASE_URL = "http://localhost:8000"

print(f"🔍 Monitoraggio analisi: {SESSION_ID}\n")

while True:
    try:
        response = requests.get(f"{BASE_URL}/api/performance/{SESSION_ID}/status")
        data = response.json()
        
        status = data.get("status")
        elapsed = data.get("elapsed_seconds", 0)
        
        print(f"\r⏱️  Elapsed: {int(elapsed)}s | Status: {status}     ", end="", flush=True)
        
        if status == "completed":
            print("\n\n✅ Analisi completata!\n")
            
            # Recupera il report completo
            report_response = requests.get(f"{BASE_URL}/api/performance/{SESSION_ID}")
            report = report_response.json()
            
            print("=" * 80)
            print("📊 REPORT SUMMARY")
            print("=" * 80)
            print(f"\nProject: {report.get('project_name')}")
            print(f"Duration: {report.get('total_duration_seconds', 0):.1f}s")
            print(f"Cost: €{report.get('total_cost_eur', 0):.4f}")
            
            tokens = report.get('total_tokens', {})
            print(f"Tokens: {tokens.get('input', 0):,} input + {tokens.get('output', 0):,} output")
            
            phases = report.get('phases', {})
            print("\n📋 PHASES:\n")
            
            if 'architect' in phases:
                arch = phases['architect']
                arch_data = arch.get('data', {})
                print(f"  ✅ ARCHITECT ({arch.get('duration_seconds', 0):.1f}s)")
                print(f"     Files: {arch_data.get('files_analyzed', 0)}")
                print(f"     Functions: {arch_data.get('total_functions_analyzed', 0)}")
                print(f"     Code smells: {len(arch_data.get('code_smells', []))}")
                print(f"     Refactoring opportunities: {len(arch_data.get('refactoring_opportunities', []))}")
            
            if 'coder' in phases:
                coder = phases['coder']
                coder_data = coder.get('data', {})
                print(f"\n  ✅ CODER ({coder.get('duration_seconds', 0):.1f}s)")
                print(f"     Refactored files: {len(coder_data.get('refactored_files', []))}")
            
            if 'optimizer' in phases:
                opt = phases['optimizer']
                print(f"\n  ✅ OPTIMIZER ({opt.get('total_iterations', 0)} iterations)")
                for i, iteration in enumerate(opt.get('iterations', []), 1):
                    print(f"     Iteration {i}: {iteration.get('status')} ({iteration.get('duration_seconds', 0):.1f}s)")
            
            if 'validator' in phases:
                val = phases['validator']
                val_data = val.get('data', {})
                print(f"\n  ✅ VALIDATOR ({val.get('duration_seconds', 0):.1f}s)")
                print(f"     Security findings: {len(val_data.get('security_findings', []))}")
                print(f"     Generated tests: {len(val_data.get('generated_tests', []))}")
            
            if 'executive_summary' in report:
                print("\n📝 EXECUTIVE SUMMARY: ✅ Generated")
            
            print("\n" + "=" * 80)
            print(f"\n💾 Report URL: http://localhost:5173/performance/report/{SESSION_ID}\n")
            break
        
        if status == "failed":
            print(f"\n\n❌ Analisi fallita: {data.get('error')}\n")
            break
        
        time.sleep(5)
        
    except KeyboardInterrupt:
        print("\n\n⏸️  Monitoraggio interrotto\n")
        sys.exit(0)
    except Exception as e:
        print(f"\n\n❌ Errore: {e}\n")
        time.sleep(5)
