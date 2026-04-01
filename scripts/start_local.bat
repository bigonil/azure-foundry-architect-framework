@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM Efesto AI Fabryc — Local Development Startup (Windows)
REM
REM Prerequisites:
REM   1. Docker Desktop running
REM   2. Python 3.11+ installed
REM   3. Node.js 18+ installed
REM   4. ANTHROPIC_API_KEY set in .env file
REM
REM Usage: scripts\start_local.bat
REM ─────────────────────────────────────────────────────────────────────────────

setlocal EnableDelayedExpansion

echo.
echo ======================================================
echo   Efesto AI Fabryc — Local Mode Startup
echo ======================================================
echo.

REM ── Step 1: Check .env ──────────────────────────────────────────────────────
if not exist ".env" (
    echo [ERROR] .env file not found.
    echo   Copy .env.example to .env and fill in your ANTHROPIC_API_KEY
    exit /b 1
)

REM Check if API key is still placeholder
findstr /C:"your-anthropic-api-key-here" .env >nul
if %errorlevel%==0 (
    echo [ERROR] Please set your ANTHROPIC_API_KEY in the .env file.
    echo   Get your key at: https://console.anthropic.com/settings/keys
    exit /b 1
)

echo [OK] .env file found

REM ── Step 2: Start MongoDB ────────────────────────────────────────────────────
echo.
echo [1/4] Starting MongoDB (Docker)...
docker compose -f compose.local.yml up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start MongoDB. Is Docker Desktop running?
    exit /b 1
)
echo [OK] MongoDB started on port 27017

REM ── Step 3: Install Python dependencies ─────────────────────────────────────
echo.
echo [2/4] Installing Python dependencies...
pip install anthropic fastapi "uvicorn[standard]" motor pydantic pydantic-settings python-dotenv PyYAML structlog hcl2 jsonschema gitpython aiofiles httpx jinja2 --quiet
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed
    exit /b 1
)
echo [OK] Python dependencies installed

REM ── Step 4: Install frontend dependencies ───────────────────────────────────
echo.
echo [3/4] Installing frontend dependencies...
cd client
call npm install --silent
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    exit /b 1
)
cd ..
echo [OK] Frontend dependencies installed

REM ── Step 5: Start servers ────────────────────────────────────────────────────
echo.
echo [4/4] Starting servers...
echo.
echo   Backend  : http://localhost:8000
echo   Frontend : http://localhost:5173
echo   API docs : http://localhost:8000/docs
echo   MongoDB  : localhost:27017
echo.
echo   Press Ctrl+C in each window to stop.
echo.

REM Start backend in new window
start "Efesto API (FastAPI)" cmd /k "uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
start "Efesto UI (Vite)" cmd /k "cd client && npm run dev"

echo [OK] Both servers starting in separate windows.
echo.
echo Open http://localhost:5173 in your browser.
echo.
