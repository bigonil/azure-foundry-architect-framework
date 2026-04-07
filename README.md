# Efesto — AI Fabryc

Multi-agent AI system for cloud architecture analysis, migration planning, cost optimization,
and Well-Architected Framework review. Built on **Azure AI Foundry** (production) and
**Claude claude-opus-4-6 by Anthropic** (local MVP mode), following Microsoft **CAF** and **WAF** best practices.

---

## MVP Mode (Branch `01_03_02`)

The current branch runs **fully locally** with real AI agents — no Azure subscription needed.

| Component | Local (MVP) | Production |
|-----------|-------------|------------|
| LLM | Claude claude-opus-4-6 (Anthropic API) | Azure OpenAI GPT-4o |
| Active agents | Code Analyzer + Infra Analyzer | All 7 agents |
| State store | MongoDB 7 (Docker) | Azure Cosmos DB |
| Cache | Redis 7 (Docker) | Azure Cache for Redis |
| Static analysis | SonarCloud (REST API) | SonarCloud (REST API) |
| Hosting | localhost | Azure Container Apps |

---

## Architecture Overview

![Architecture — Azure and Local deployment](docs/architecture.png)

```
┌─────────────────────────────────────────────────────────────────┐
│                        User / Frontend                          │
│           React SPA (Vite + Tailwind) — MVP Mode badge         │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API (/api/analysis/start)
┌────────────────────────────▼────────────────────────────────────┐
│                      FastAPI Backend                            │
│         POST /start  →  202 (async)  →  GET /status + /report  │
│                   Redis cache (2 levels)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   Orchestrator Agent                            │
│     Per-agent Redis cache → skip Claude if already computed     │
└──────────────────┬──────────────────────────────────────────────┘
                   │ Phase 1 (sequential, MVP active)
      ┌────────────┴────────────┐
      ▼                         ▼
┌──────────────┐         ┌──────────────┐
│ Code Analyzer│         │Infra Analyzer│
│  + SonarCloud│         │              │
│  REST API    │         │              │
└──────────────┘         └──────────────┘
      │ Phase 2 (parallel, coming soon)
      ▼
┌─────────────────────────────────────────┐
│  Cost Opt │ Migration │ GAP │ WAF │ QA  │  ← grayed out in MVP
└─────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────┐
│            Claude claude-opus-4-6            │
│     Synthesis → final report (EUR)      │
└─────────────────────────────────────────┘
```

---

## Specialist Agents

| Agent | MVP | Role | Key Outputs |
|-------|-----|------|-------------|
| `code_analyzer` | ✅ Active | App code analysis + SonarCloud | Language/framework inventory, cloud coupling score, tech debt, SonarCloud quality gate |
| `infra_analyzer` | ✅ Active | IaC analysis | Resource inventory, service mapping, security posture |
| `cost_optimizer` | ⏳ Coming soon | FinOps analysis | Savings opportunities, reserved instance ROI |
| `migration_planner` | ⏳ Coming soon | CAF migration planning | 6Rs strategy, wave plan, risk register |
| `gap_analyzer` | ⏳ Coming soon | GAP analysis | Current vs target gaps across 7 dimensions |
| `waf_reviewer` | ⏳ Coming soon | WAF review | 5-pillar scoring with prioritized recommendations |
| `quality_analyzer` | ⏳ Coming soon | Quality gate | SonarQube-level code & IaC analysis |

---

## SonarCloud Integration

The `code_analyzer` agent automatically queries **SonarCloud** for each project before running the
Claude analysis. Results are embedded in the Claude prompt (for richer analysis) and displayed
as a dedicated section at the bottom of every report.

**What is fetched:**
- Quality Gate status (OK / ERROR)
- Metrics: bugs, vulnerabilities, security hotspots, code smells, coverage %, duplication %, technical debt, LOC
- Ratings: Reliability (A–E), Security (A–E), Maintainability (A–E)
- Top open issues (BLOCKER / CRITICAL / MAJOR bugs + vulnerabilities)
- Failing quality gate conditions

**How project matching works:**
The agent searches SonarCloud using the project name entered in the form (fuzzy match, exact name preferred).
The project must have been scanned at least once via `sonar-scanner` or CI/CD pipeline.

**Configuration (`.env`):**
```env
SONARCLOUD_TOKEN=<your-user-token>   # Settings → Security → Generate Token
SONARCLOUD_ORG=bigonil               # Organization key (visible in Org Settings)
```

---

## Redis Cache (Two Levels)

All analysis results are cached in Redis to avoid redundant Claude API calls.

| Level | Cache key | TTL | Effect |
|-------|-----------|-----|--------|
| **Report** | SHA-256 of entire request | 24h | Identical request → instant response, 0 Claude calls |
| **Per-agent** | SHA-256 of agent-specific inputs | 48h | Reuses single agent result across different analysis types |

Redis degrades gracefully — if unavailable, analysis runs normally with no caching.

---

## Project Structure

```
azure-foundry-architect-framework/
├── src/
│   ├── agents/
│   │   ├── base_agent.py         # Abstract base (Anthropic + Azure + Foundry modes)
│   │   ├── orchestrator.py       # Master coordinator (per-agent cache)
│   │   ├── code_analyzer.py      # + SonarCloud enrichment
│   │   ├── infra_analyzer.py
│   │   ├── cost_optimizer.py
│   │   ├── migration_planner.py
│   │   ├── gap_analyzer.py
│   │   ├── waf_reviewer.py
│   │   └── quality_analyzer.py
│   ├── tools/
│   │   ├── code_scanner.py       # Language/framework/SDK detection
│   │   ├── infra_parser.py       # Terraform/Bicep/K8s parsing
│   │   ├── pricing_calculator.py # Azure Pricing API client
│   │   └── sonarcloud_client.py  # SonarCloud REST API client
│   ├── cache/
│   │   └── redis_cache.py        # Two-level Redis cache (report + per-agent)
│   ├── api/
│   │   ├── main.py
│   │   ├── routes/analysis.py    # async /start + /status + /report
│   │   └── models/
│   └── config/
│       ├── settings.py           # Pydantic Settings (all env vars)
│       └── prompts/              # YAML system prompts per agent
├── client/
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx      # Agent cards (MVP active/grayed)
│       │   ├── AnalysisPage.tsx  # Form (MVP agents pre-selected)
│       │   └── ReportPage.tsx    # Report + SonarCloud section
│       ├── components/Dashboard/Layout.tsx  # MVP Mode badge
│       └── services/api.ts
├── compose.local.yml             # MongoDB + Redis (local dev)
├── compose.yml                   # Full stack (production-like)
├── pyproject.toml
└── .env                          # Local secrets (never commit)
```

---

## Quick Start — Local MVP Mode

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker Desktop (for MongoDB + Redis)
- Anthropic API key (`claude-opus-4-6` access)
- SonarCloud account + user token (optional but recommended)

### 1. Clone and configure

```bash
git clone https://github.com/bigonil/azure-foundry-architect-framework.git
cd azure-foundry-architect-framework
git checkout 01_03_02

cp .env.example .env   # then edit .env
```

Minimal `.env` for local MVP mode:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-6

MONGODB_URI=mongodb://admin:changeme_local@localhost:27017/efesto-fabryc?authSource=admin
REDIS_URI=redis://localhost:6379/0

SONARCLOUD_TOKEN=<your-token>
SONARCLOUD_ORG=bigonil

AGENT_TIMEOUT_SECONDS=300
```

### 2. Start infrastructure (MongoDB + Redis)

```bash
docker compose -f compose.local.yml up -d
```

Verifica:
```bash
docker compose -f compose.local.yml ps
# mongodb   → healthy
# redis     → healthy
```

### 3. Start backend

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

pip install -e .
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

### 4. Start frontend

```bash
cd client
npm install
npm run dev
```

App: http://localhost:5173

---

## Environment Variables Reference

```env
# ── LLM ──────────────────────────────────────────────────────────
LLM_PROVIDER=anthropic           # anthropic | azure
ANTHROPIC_API_KEY=               # required for local mode
ANTHROPIC_MODEL=claude-opus-4-6

# ── Database ──────────────────────────────────────────────────────
MONGO_ROOT_PASSWORD=changeme_local
MONGODB_URI=mongodb://admin:changeme_local@localhost:27017/efesto-fabryc?authSource=admin
MONGODB_DATABASE=efesto-fabryc

# ── Cache ─────────────────────────────────────────────────────────
REDIS_URI=redis://localhost:6379/0
CACHE_REPORT_TTL_HOURS=24        # full report cache TTL
CACHE_AGENT_TTL_HOURS=48         # per-agent result cache TTL

# ── SonarCloud ────────────────────────────────────────────────────
SONARCLOUD_TOKEN=                # user token from sonarcloud.io
SONARCLOUD_ORG=bigonil           # organization key (not display name)

# ── Agents ────────────────────────────────────────────────────────
AGENT_MAX_TOKENS=4096
AGENT_TEMPERATURE=0.1
AGENT_PARALLEL_LIMIT=4
AGENT_TIMEOUT_SECONDS=300

# ── App ───────────────────────────────────────────────────────────
APP_ENV=development
APP_LOG_LEVEL=INFO
APP_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ── Azure (leave empty for local mode) ───────────────────────────
AZURE_AI_PROJECT_CONNECTION_STRING=
AZURE_AI_FOUNDRY_ENDPOINT=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analysis/start` | Start async analysis (checks Redis cache first) |
| `GET` | `/api/analysis/{id}/status` | Poll status: `running` / `completed` / `failed` |
| `GET` | `/api/analysis/{id}` | Fetch full report (200 when completed) |
| `GET` | `/api/analysis/` | List all sessions |
| `POST` | `/api/analysis/quick-scan` | Synchronous scan (small projects) |
| `GET` | `/health` | Health check |

---

## Agent Execution Modes

| Mode | Config | Pros | Cons |
|------|--------|------|------|
| **Anthropic** (MVP) | `LLM_PROVIDER=anthropic` | No Azure needed, Claude claude-opus-4-6 | Requires Anthropic Pro subscription |
| **Azure Direct** | `LLM_PROVIDER=azure` | Low latency, GPT-4o | Azure OpenAI endpoint required |
| **Foundry** | `use_foundry_mode=true` | Full persistence, threading, tools | Azure AI Foundry project required |

---

## Architecture Decisions

| Decision | Local MVP | Production |
|----------|-----------|------------|
| LLM | Claude claude-opus-4-6 (Anthropic) | Azure OpenAI GPT-4o |
| State store | MongoDB 7 (Docker) | Azure Cosmos DB |
| Cache | Redis 7 (Docker, LRU 256MB) | Azure Cache for Redis |
| Static analysis | SonarCloud REST API | SonarCloud REST API |
| Auth | API keys (.env) | Managed Identity (RBAC) |
| Hosting | localhost | Azure Container Apps (scale-to-0) |
| IaC | — | Azure Bicep (`infra/`) |

---

## WAF Compliance Summary

| Pillar | Implementation |
|--------|---------------|
| **Reliability** | Health probes, retry logic in agents, graceful Redis/SonarCloud degradation |
| **Security** | Managed Identity (prod), Key Vault, Private Endpoints (prod), no secrets in code |
| **Cost Optimization** | Redis cache (avoid redundant Claude calls), scale-to-0 Container Apps, EUR cost reporting |
| **Operational Excellence** | IaC (Bicep), structured logging, `/health` endpoint, async job pattern |
| **Performance** | Parallel agent execution (asyncio), two-level Redis cache, SonarCloud pre-fetch |
