#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Efesto AI Fabryc — Local Development Startup (Linux / macOS)
#
# Prerequisites:
#   1. Docker / Docker Desktop running
#   2. Python 3.11+ installed
#   3. Node.js 18+ installed
#   4. ANTHROPIC_API_KEY set in .env file
#
# Usage: bash scripts/start_local.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "======================================================"
echo "  Efesto AI Fabryc — Local Mode Startup"
echo "======================================================"
echo ""

# ── Step 1: Check .env ────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  echo "[ERROR] .env file not found."
  echo "  Copy .env.example to .env and fill in your ANTHROPIC_API_KEY"
  exit 1
fi

if grep -q "your-anthropic-api-key-here" .env; then
  echo "[ERROR] Please set your ANTHROPIC_API_KEY in the .env file."
  echo "  Get your key at: https://console.anthropic.com/settings/keys"
  exit 1
fi

echo "[OK] .env file found"

# ── Step 2: Start MongoDB ─────────────────────────────────────────────────────
echo ""
echo "[1/4] Starting MongoDB (Docker)..."
docker compose -f compose.local.yml up -d
echo "[OK] MongoDB started on port 27017"

# ── Step 3: Install Python dependencies ──────────────────────────────────────
echo ""
echo "[2/4] Installing Python dependencies..."
pip install anthropic fastapi "uvicorn[standard]" motor pydantic pydantic-settings \
    python-dotenv PyYAML structlog hcl2 jsonschema gitpython aiofiles httpx jinja2 -q
echo "[OK] Python dependencies installed"

# ── Step 4: Install frontend dependencies ────────────────────────────────────
echo ""
echo "[3/4] Installing frontend dependencies..."
(cd client && npm install --silent)
echo "[OK] Frontend dependencies installed"

# ── Step 5: Start servers ─────────────────────────────────────────────────────
echo ""
echo "[4/4] Starting servers..."
echo ""
echo "  Backend  : http://localhost:8000"
echo "  Frontend : http://localhost:5173"
echo "  API docs : http://localhost:8000/docs"
echo "  MongoDB  : localhost:27017"
echo ""
echo "  Press Ctrl+C to stop all servers."
echo ""

# Start backend in background
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 2

# Start frontend in background
(cd client && npm run dev) &
FRONTEND_PID=$!

# Trap Ctrl+C to kill both
trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose -f compose.local.yml down; exit 0" INT

wait
