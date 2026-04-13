import requests
r = requests.get('http://localhost:8000/api/performance/perf_1776062917419/status')
d = r.json()
print(f"Status: {d['status']}")
print(f"Elapsed: {int(d['elapsed_seconds'])}s ({d['elapsed_seconds']/60:.1f} min)")
if d.get('error'):
    print(f"Error: {d['error']}")
