# Efesto — AI Fabryc

Multi-agent AI system for cloud architecture analysis, migration planning, cost optimization,
and Well-Architected Framework review. Built on **Azure AI Foundry** (production) and
**Claude Opus 4.6 by Anthropic** (local MVP mode), following Microsoft **CAF** and **WAF** best practices.

---

## Component Matrix

| Component | Local (MVP) | Production (Azure) |
|---|---|---|
| LLM | Claude Opus 4.6 (Anthropic API) | Azure OpenAI GPT-4o |
| Active agents | All 7 + MCP Enrichment (Phase 1.5) | All 7 + MCP Enrichment |
| State store | MongoDB 7 (Docker) | Azure Cosmos DB |
| Cache | Redis 7 (Docker) | Azure Cache for Redis |
| Object storage | MinIO (Docker, porta 9007 in full-stack / 9005 in dev) | Azure Blob Storage |
| Static analysis | SonarCloud REST API | SonarCloud REST API |
| Artifact sources | Upload / MinIO / Volume / Git clone | Upload / Blob Storage / Git clone |
| MCP enrichment | Pre-configured Docker services (`--profile mcp`) | Pre-configured internal services |
| Token tracking | Per-agent + synthesis, EUR cost | Per-agent + synthesis, EUR cost |
| Hosting | localhost | Azure Container Apps |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User / Frontend                               │
│           React SPA (Vite + Tailwind) — localhost:5173              │
└────────────────────────────┬────────────────────────────────────────┘
                             │ REST API
┌────────────────────────────▼────────────────────────────────────────┐
│                      FastAPI Backend — :8000                         │
│   POST /start → 202 async   GET /status   GET /report               │
│   POST /artifacts/presign   Redis cache (2 levels)                  │
│   Token tracking (in/out per agent + synthesis + total EUR)         │
└────────────────────────────┬────────────────────────────────────────┘
        ┌───────────────────┬┴──────────────────┐
        ▼                   ▼                   ▼
 ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐
 │   MongoDB   │   │    Redis     │   │ MinIO / Azure   │
 │  (sessions  │   │  (2-level    │   │ Blob Storage    │
 │   reports)  │   │   cache)     │   │  (artifacts)    │
 └─────────────┘   └──────────────┘   └─────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │  Orchestrator     │
                  └─────────┬─────────┘
                            │
           ┌────────────────┴────────────────┐
           │ Phase 1 (Sequential)            │
           ▼                                 ▼
  ┌──────────────────┐             ┌──────────────────┐
  │  Code Analyzer   │             │  Infra Analyzer  │
  │  + SonarCloud    │             │  (Terraform,     │
  │                  │             │   Bicep, K8s…)   │
  └──────────────────┘             └──────────────────┘
           │
           │ Phase 1.5 (Conditional — only when MCP servers active)
           ▼
  ┌─────────────────────────────────────────────────────┐
  │  MCP Enrichment Agent                               │
  │  Azure Skills: azure-migrate · advisor · pricing   │
  │  cloudarchitect · WAF · bestpractices · AKS · SQL  │
  │  Azure DevOps: repos · pipelines · work items      │
  └──────────────────────────┬──────────────────────────┘
                             │         ┌─────────────────────────────┐
                             │         │  mcp-azure:3333             │ @azure/mcp (.NET)
                             ├────────►│  localhost:3333 (local dev) │
                             │         └─────────────────────────────┘
                             │         ┌─────────────────────────────┐
                             └────────►│  mcp-devops:3334            │ @azure-devops/mcp
                                       │  localhost:3334 (local dev) │
                                       └─────────────────────────────┘
           │
           │ Phase 2 (Parallel)
           ▼
  ┌───────────────────────────────────────────────────────┐
  │  Cost Optimizer │ Migration Planner │ GAP Analyzer   │
  │  WAF Reviewer   │ Quality Analyzer                   │
  └───────────────────────────────────────────────────────┘
           │
           │ Phase 3 — Synthesis (Claude aggregates all results)
           ▼
  ┌──────────────────────────────────────┐
  │  Final Report (stored in MongoDB)   │
  └──────────────────────────────────────┘
```

---

## Specialist Agents

| Agent | Phase | Role | Key Outputs |
|---|---|---|---|
| `code_analyzer` | 1 | App code + SonarCloud + MCP | Language inventory, cloud coupling, tech debt, quality gate, OWASP Top 10, SOLID, 12-Factor, `mcp_guidance` (Azure App guidelines via MCP) |
| `infra_analyzer` | 1 | IaC analysis + MCP | Resource inventory, networking, security posture, WAF 5 pillars, CIS Benchmark, CAF, `mcp_infra_guidance` (Azure Infra guidelines via MCP) |
| `mcp_enrichment` | 1.5 | Azure Skills enrichment | Migration readiness, real pricing, Advisor recs, WAF, reference archs |
| `cost_optimizer` | 2 | FinOps | Savings, reserved instance ROI, right-sizing |
| `migration_planner` | 2 | CAF migration | 6Rs strategy, wave plan, effort detail, risk register |
| `gap_analyzer` | 2 | GAP analysis | Current vs target across 7 dimensions |
| `waf_reviewer` | 2 | WAF review | 5-pillar scoring with recommendations |
| `quality_analyzer` | 2 | Quality gate | SonarQube-level code & IaC analysis |

> **Phase 1** agents (`code_analyzer`, `infra_analyzer`) now run in two sub-steps: (A) Claude static analysis with embedded best-practice guidelines, then (B) targeted Azure MCP enrichment if MCP servers are active.
> **Phase 1.5** runs only when at least one Azure MCP server is active. Failures are non-fatal — the pipeline continues without enrichment data.

---

## Project Structure

```
azure-foundry-architect-framework/
├── src/
│   ├── agents/
│   │   ├── base_agent.py             # Abstract base — standard messages API only (no MCP beta)
│   │   ├── orchestrator.py           # Phases 1→1.5→2→3, _build_mcp_servers, token aggregation
│   │   ├── code_analyzer.py          # Opzione A (OWASP/SOLID/12-Factor) + Opzione B (MCP)
│   │   ├── infra_analyzer.py         # Opzione A (CIS/WAF/CAF) + Opzione B (MCP)
│   │   ├── mcp_helpers.py            # Shared: targeted_mcp_call + synthesize_mcp_guidance
│   │   ├── mcp_enrichment_agent.py   # Phase 1.5 — Azure Skills via MCP
│   │   ├── cost_optimizer.py
│   │   ├── migration_planner.py      # + effort_detail (person-days, roles, waves, EUR cost)
│   │   ├── gap_analyzer.py
│   │   ├── waf_reviewer.py
│   │   └── quality_analyzer.py
│   ├── tools/
│   │   ├── blob_storage.py           # MinIO (boto3) + Azure Blob (azure-storage-blob)
│   │   ├── git_importer.py           # Async shallow clone: GitHub + Azure DevOps
│   │   ├── volume_reader.py          # Read artifacts from /app/uploads volume
│   │   ├── code_scanner.py           # Language/framework/SDK detection
│   │   ├── infra_parser.py           # Terraform/Bicep/K8s parsing
│   │   ├── pricing_calculator.py     # Azure Pricing API client
│   │   └── sonarcloud_client.py      # SonarCloud REST API client
│   ├── cache/
│   │   └── redis_cache.py            # Two-level Redis cache (report + per-agent)
│   ├── api/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   ├── analysis.py           # /start /status /report /quick-scan
│   │   │   └── artifacts.py          # /presign /upload-to-volume /delete
│   │   └── models/
│   │       ├── requests.py           # AnalysisRequestBody + McpServerConfig (preconfigured, authorization_token)
│   │       └── responses.py          # AgentResultSummary + token fields
│   └── config/
│       ├── settings.py               # Pydantic Settings (all env vars + preconfigured_mcp_servers property)
│       └── prompts/
│           ├── mcp_enrichment.yaml        # Azure Skills system prompt (Phase 1.5)
│           └── *.yaml                # Per-agent system prompts
├── client/
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx          # + MCP Enrichment in agent list
│       │   ├── AnalysisPage.tsx      # Pre-configured Azure MCP toggles + custom servers
│       │   └── ReportPage.tsx        # Single-scroll: Exec Summary → Strategy → Findings →
│       │                             #   Actions → Roadmap → Effort → App Analysis
│       │                             #   (12-Factor/OWASP/SOLID/CodeMcpGuidancePanel) →
│       │                             #   SonarCloud → Dev Actions → Infra Recs →
│       │                             #   InfraMcpGuidancePanel → McpEnrichmentPanel → Cloud Actions
│       └── services/api.ts           # McpServerConfig + TwelveFactorItem + OwaspFinding +
│                                     # SolidItem + CodeMcpGuidance + InfraMcpGuidance
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.client
│   ├── Dockerfile.mcp-azure          # NEW — @azure/mcp via supergateway SSE
│   ├── Dockerfile.mcp-devops         # NEW — @azure-devops/mcp via supergateway SSE
│   └── nginx.conf
├── infra/                            # Azure Bicep (production IaC)
├── scripts/
│   └── setup-rbac.sh
├── compose.local.yml                 # MongoDB + Redis + MinIO (local dev, no build)
├── compose.yml                       # Full stack + mcp-azure + mcp-devops (--profile mcp)
├── pyproject.toml
├── .env.example
└── .env
```

---

## Feature Summary

### Token Tracking & Cost

Every Anthropic API call captures `input_tokens` and `output_tokens` via `response.usage`.
Costs are computed in EUR using configurable pricing:

| Parameter | Default | Notes |
|---|---|---|
| `CLAUDE_INPUT_PRICE_PER_1M_USD` | `15.0` | Claude Opus 4.6 input price |
| `CLAUDE_OUTPUT_PRICE_PER_1M_USD` | `75.0` | Claude Opus 4.6 output price |
| `EUR_USD_RATE` | `0.92` | Override with current rate |
| `MONTHLY_BUDGET_EUR` | `100.0` | Soft budget shown in UI |

The report page shows:
- Total input/output tokens and EUR cost for the full analysis
- Per-agent breakdown with proportional bars (all agents shown, including those with 0 tokens)
- Remaining budget and percentage used (color-coded)

### Synthesis (Phase 3)

After all agents complete, the orchestrator sends a **compact synthesis prompt** to Claude Opus 4.6 (`max_tokens=8192`) and produces the final unified report. The prompt includes only the structured agent outputs — heavy/redundant fields (`raw`, `sonarqube_analysis`, `mcp_guidance`, `mcp_infra_guidance`) and arrays larger than 20 items are stripped by `_compact_for_synthesis()` before building the context. This keeps the synthesis prompt manageable and synthesis quality high.

If synthesis JSON parsing fails (e.g., malformed response), the orchestrator saves a minimal synthesis object (`maturity_score=2.5`, empty lists) so the session still completes and the UI can display agent-level data.

### Maturity Score

Displayed in the report header. Computed by Claude during synthesis (Phase 3), scored 1.0–5.0:

| Score | Meaning |
|---|---|
| 1.0–2.0 | Legacy / high migration risk |
| 2.0–3.5 | Moderate coupling, refactoring required |
| 3.5–5.0 | Cloud-native / migration-ready |

Based on: **code quality** (SonarCloud metrics + static analysis) + **cloud coupling score** (how tightly the code is bound to the source provider) + **infrastructure complexity** (resource count, service dependencies).

### MCP Enrichment — Phase 1 (Opzione A + B) and Phase 1.5

MCP intelligence is applied at two levels:

#### Opzione A — Embedded best-practice guidelines (always active, no MCP required)

The **code_analyzer** and **infra_analyzer** Claude prompts include industry standards directly:

| Agent | Standards embedded in prompt |
|---|---|
| `code_analyzer` | OWASP Top 10 (2021, A01–A10), SOLID principles (S/O/L/I/D), 12-Factor App (all 12), CNCF Cloud-Native Readiness |
| `infra_analyzer` | CIS Azure Foundations Benchmark (6 categories), Azure Well-Architected Framework (5 pillars, scored 1–5), Azure Cloud Adoption Framework (6 Landing Zone design areas) |

Both agents produce structured output with explicit fields: `owasp_findings`, `solid_assessment`, `twelve_factor`, `waf_assessment`, `caf_assessment`, `cis_findings`.

#### Opzione B — Live Azure MCP guidance (Phase 1, conditional on active MCP servers)

After Opzione A static analysis, **Phase 1 agents call targeted Azure MCP tools** to enrich results with live Azure intelligence. The MCP output **adds to** (never replaces) Opzione A results.

| Agent | MCP tools called | Output field |
|---|---|---|
| `code_analyzer` | `get_azure_bestpractices`, `cloudarchitect` + arch-specific (`containerapps`, `appservice`, `functionapp`) | `mcp_guidance` |
| `infra_analyzer` | `wellarchitectedframework`, `get_azure_bestpractices` + IaC-specific (`azureterraformbestpractices`, `bicepschema`) + up to 4 service-specific tools | `mcp_infra_guidance` |

Both use the shared `mcp_helpers.py` helpers: `targeted_mcp_call` (opens SSE, calls patterns) + `synthesize_mcp_guidance` (single Haiku call to structure raw results).

The cache key discriminates MCP vs non-MCP runs via `has_mcp: bool` — enriched results are never served from a non-MCP cache entry.

#### Phase 1.5 — Full Azure Skills enrichment

When Azure MCP servers are active, a dedicated **MCP Enrichment Agent** runs between Phase 1 and Phase 2. It calls Azure Skills to retrieve **real Azure intelligence** and injects it into the synthesis prompt — so the final report uses actual pricing, actual migration readiness scores, and real Azure Advisor recommendations instead of estimates.

**Implementation**: Phase 1 agents connect to MCP via `mcp_helpers.targeted_mcp_call`. `McpEnrichmentAgent` (Phase 1.5) uses a full Claude tool-use loop. Both approaches use local SSE (`mcp[cli]` Python SDK + `AsyncExitStack`) — not the Anthropic MCP beta — to avoid the constraint that server URLs must be publicly reachable from Anthropic's cloud.

The MCP tool-use loop connects to servers via local SSE (`mcp[cli]` Python SDK + `AsyncExitStack`) and uses **`claude-haiku-4-5-20251001`** (configurable via `ANTHROPIC_MODEL_MCP`) to stay within rate limits across 10–30 tool calls per analysis. Rate limit errors exit the loop gracefully and return partial results.

**`azuremigrate` is always called first** (mandatory pre-call before the Claude loop). The backend invokes it directly via `sess.call_tool()` before entering the Claude tool-use loop — guaranteeing migration assessment data is captured regardless of Claude’s tool selection. The raw result is injected into Claude’s initial message and stored verbatim as `azure_migrate_raw` in the report (shown in a collapsible block in the UI). SSE connections include a **3-attempt retry with 2s backoff** to survive transient disconnects (e.g. after a uvicorn hot-reload).

**MCP enrichment output** (all fields sent to the frontend via `AgentResultSummary.data`):

| Field | Content |
|---|---|
| `migration_readiness` | Score, suitability, blockers, dependencies, estimated effort weeks |
| `aws_to_azure_service_mapping` | Per-service mapping: source tier, Azure SKU, migration approach (lift-and-shift/re-platform/re-arch), complexity, €/mo, step-by-step migration instructions, docs URL |
| `azure_pricing_estimate` | Monthly EUR total, comparison vs current spend, savings %, line-item breakdown with SKU + quantity, optimization tips |
| `advisor_recommendations` | Category, severity, recommendation, impact, implementation steps |
| `waf_assessment` | 5-pillar scores (1–5) with findings and recommendations per pillar |
| `reference_architectures` | Name, Microsoft Learn URL, fit score, key components |
| `service_guidance` | Per-Azure-service: SKU, sizing notes, migration steps, config tips, docs URL, €/mo |
| `infrastructure_recommendations` | Area, priority, recommendation, rationale, effort |
| `migration_path` | Recommended approach, phased timeline (services, activities, risks), quick wins |
| `best_practices` | Azure best practices for the specific services detected |
| `azure_migrate_raw` | Verbatim text from Azure Migrate skill |

**Supergateway reconnect fix**: `@modelcontextprotocol/sdk`’s `Server.close()` calls `transport.close()` but never resets the internal `_transport` field — only the `onclose` event callback does, which doesn’t fire when the HTTP response is already ended. Without the fix, every second SSE connection throws `Already connected to a transport`. `Dockerfile.mcp-azure` patches `stdioToSse.js` at build time to also set `server._transport = undefined` after `close()`, making all reconnects reliable.

**Azure MCP Skills called (all relevant ones per scenario):**

| Category | Skills |
|---|---|
| Migration | `azuremigrate` **(called first — most important)**, `cloudarchitect`, `get_azure_bestpractices`, `azureterraformbestpractices` |
| WAF & Docs | `wellarchitectedframework`, `documentation`, `bicepschema` |
| Pricing & Advisor | `pricing`, `advisor`, `quota`, `marketplace` |
| Compute | `compute`, `aks`, `appservice`, `containerapps`, `functionapp`, `functions` |
| Databases | `sql`, `postgres`, `mysql`, `cosmos`, `redis` |
| Messaging | `servicebus`, `eventhubs`, `eventgrid`, `signalr` |
| Storage & Security | `storage`, `fileshares`, `keyvault`, `role`, `policy` |
| Observability | `monitor`, `applicationinsights`, `grafana`, `workbooks` |
| Resources | `group_list`, `group_resource_list`, `subscription_list`, `resourcehealth` |

**Azure DevOps MCP Tools (if enabled):**

| Toolset | Tools |
|---|---|
| Repos | `repo_list_repos_by_project`, `repo_list_pull_requests`, `repo_list_branches`, `repo_search_commits` |
| Work Items | `wit_my_work_items`, `wit_list_backlogs`, `wit_get_work_item`, `search_workitem` |
| Pipelines | `pipelines_get_builds`, `pipelines_list_runs`, `pipelines_get_build_status`, `pipelines_get_build_log` |
| Wiki & Test | `wiki_list_wikis`, `wiki_get_page_content`, `testplan_list_test_plans` |
| Search | `search_code`, `search_wiki` |

> **Note on Azure DevOps Remote MCP**: The remote endpoint `https://mcp.dev.azure.com/{org}` requires Entra OAuth and currently does **not** support the Anthropic API MCP client. The Docker service uses the local **`@azure-devops/mcp`** package (v2.5.0+) authenticated via PAT (`--authentication env`).
> 
> **Corporate SSL proxy**: `NODE_TLS_REJECT_UNAUTHORIZED=0` is set in the container. For production, the corporate CA bundle is mounted at `/usr/local/share/ca-certificates/corporate-ca-bundle.pem` and `NODE_EXTRA_CA_CERTS` is set **inline in the Dockerfile CMD** (not as a Docker env var) to prevent the host Windows path from leaking in via Docker Desktop / Git Bash.

### Detailed Migration Effort

The `migration_planner` agent outputs an `effort_detail` block with:
- **Total person-days and hours** (base × strategy factor × risk multiplier)
- **Team roles** with allocation %, person-days, daily rate EUR, total labour cost
- **Wave planning** (Wave 0: Foundation → Wave 3: Complex workloads)
- **Per-component complexity** (base days → final days with strategy + risk applied)

### Artifact Source Options

| Tab | How it works | Best for |
|---|---|---|
| **File Upload** | Drag & drop files + "Add Folder" (browser → JSON body) | Quick tests, small projects |
| **Object Storage** | Presigned PUT → MinIO/Azure Blob (browser → storage direct) | Large files, production parity |
| **Local Volume** | Backend reads `/app/uploads` at analysis start | CI/CD, persistent reuse |
| **GitHub** | Server-side shallow clone (`--depth 1`) | Code on GitHub |
| **Azure DevOps** | Server-side shallow clone with PAT | Code on Azure DevOps |

---

# Local Deployment — Step by Step

## Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Python | 3.11 | `python --version` |
| Node.js | 20 | `node --version` |
| Docker Desktop | 4.x | `docker --version` |
| Git | any | `git --version` |
| Anthropic API key | — | [console.anthropic.com](https://console.anthropic.com) |
| SonarCloud token | optional | [sonarcloud.io](https://sonarcloud.io) |

---

## Step 1 — Clone the repository

```bash
git clone https://github.com/bigonil/azure-foundry-architect-framework.git
cd azure-foundry-architect-framework
git checkout 01_03_02
```

---

## Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
# ── LLM (mandatory) ───────────────────────────────────────────────
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...          # https://console.anthropic.com → API Keys
ANTHROPIC_MODEL=claude-opus-4-6
# MCP enrichment uses Haiku (lighter model, 10x higher rate limits for tool loops)
# ANTHROPIC_MODEL_MCP=claude-haiku-4-5-20251001  # default — change only if needed

# ── MongoDB ───────────────────────────────────────────────────────
MONGO_ROOT_PASSWORD=changeme_local
MONGODB_URI=mongodb://admin:changeme_local@localhost:27017/efesto-fabryc?authSource=admin
MONGODB_DATABASE=efesto-fabryc

# ── Redis ─────────────────────────────────────────────────────────
REDIS_URI=redis://localhost:6379/0

# ── SonarCloud (optional) ─────────────────────────────────────────
SONARCLOUD_TOKEN=
SONARCLOUD_ORG=bigonil

# ── Object Storage (optional) ─────────────────────────────────────
STORAGE_BACKEND=disabled              # "minio" to enable MinIO tab
MINIO_ENDPOINT=http://localhost:9005
MINIO_PUBLIC_ENDPOINT=http://localhost:9005
MINIO_ACCESS_KEY=efesto
MINIO_SECRET_KEY=changeme_local_minio
MINIO_BUCKET=efesto-artifacts

# ── Token pricing ─────────────────────────────────────────────────
CLAUDE_INPUT_PRICE_PER_1M_USD=15.0
CLAUDE_OUTPUT_PRICE_PER_1M_USD=75.0
EUR_USD_RATE=0.92
MONTHLY_BUDGET_EUR=100.0

# ── Agents ────────────────────────────────────────────────────────
AGENT_TIMEOUT_SECONDS=300
AGENT_MAX_TOKENS=4096
AGENT_TEMPERATURE=0.1
AGENT_PARALLEL_LIMIT=4

# ── App ───────────────────────────────────────────────────────────
APP_ENV=development
APP_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Step 3 — Start Docker services (MongoDB + Redis + MinIO)

```bash
docker compose -f compose.local.yml up -d
```

Wait for all services to be healthy:

```bash
docker compose -f compose.local.yml ps
```

---

## Step 4 — Install Python dependencies and start the backend

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -e .
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: [http://localhost:8000/health](http://localhost:8000/health)

---

## Step 5 — Start the frontend

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Step 6 — Using the application

1. **Home** → click **Start Analysis**
2. **Section 1 — Project Information**: project name, source cloud, monthly cost
3. **Section 2 — Analysis Scope**: default is **All Agents** (all 7 run + MCP Enrichment if active)
4. **Section 3 — Artifact Source**: choose how to provide code

   | Scenario | Tab |
   |---|---|
   | Files on your PC | **File Upload** → drag & drop |
   | Large files | **Object Storage** → direct upload to MinIO |
   | Docker-mounted folder | **Local Volume** → paths relative to `/app/uploads` |
   | Code on GitHub | **GitHub** → repo URL + branch + optional PAT |
   | Code on Azure DevOps | **Azure DevOps** → Org URL + Project + Repo + PAT |

5. **Section 4 — MCP Enrichment Sources** (Beta):
   - Toggle **Azure MCP** and/or **Azure DevOps MCP** — no URL needed (managed server-side)
   - Click **View skills ▼** to see all available Azure Skills per server
   - Custom AWS/GCP servers require a URL endpoint

6. Click **Start Analysis** — analysis runs in the background, page polls every 3s.

### Report page outputs

The report is a **single scrollable page** — all sections render in sequence:

| # | Section | Content |
|---|---|---|
| 1 | Agent Status Bar | Each agent status, duration, token usage |
| 2 | **Token & Cost Panel** | Total tokens, EUR cost, budget bar, per-agent breakdown |
| 3 | Executive Summary | C-level summary with EUR values |
| 4 | Strategy / Timeline / Savings | 6R strategy, weeks, monthly savings |
| 5 | Key Findings & Critical Risks | Agent-derived findings and critical risks |
| 6 | Recommended Actions | Top 10 actions with owner, timeline, effort, impact |
| 7 | Migration Roadmap | Phase-by-phase with objectives and milestones |
| 8 | **Migration Effort Detail** | Person-days, hours, team allocation (roles + EUR rates), wave breakdown |
| 9 | **Code Analysis** | Technology inventory, cloud coupling, architecture, containerization readiness, technical debt |
| 10 | **12-Factor Compliance** | All 12 factors with PASS/PARTIAL/FAIL status and notes |
| 11 | **OWASP Top 10** | A01–A10 with FOUND/RISK/CLEAN/N/A status and details |
| 12 | **SOLID Assessment** | S/O/L/I/D with APPLIED/PARTIAL/VIOLATED/N/A and notes |
| 13 | **Azure App Guidelines** *(MCP)* | `mcp_guidance`: Azure-specific code guidelines, framework guidance, quick wins (blue panel, via MCP) |
| 14 | **Code Quality** | Quality gate, ratings (A–E), bugs/vulnerabilities/smells/hotspots |
| 15 | **App Recommendations** | Synthesis dev-focused recommendations (OWASP, 12-factor, CNCF, refactoring) |
| 16 | **App Migration Checklist** | Concrete code changes for Azure migration (SDK swaps, config, auth, CI/CD) |
| 17 | SonarCloud Analysis | Quality gate, ratings, metrics, top issues |
| 18 | Dev/Security team actions | Top 10 actions filtered by `owner: dev_team` or `security_team` |
| 19 | **Infrastructure Recommendations** | Synthesis infra items: networking, IaC, scalability, resilience, cost, monitoring |
| 20 | **Azure Infra Guidelines** *(MCP)* | `mcp_infra_guidance`: IaC best practices, service-specific guidance, Azure guidelines (purple panel, via MCP) |
| 21 | **Azure MCP Enrichment** | Full Phase 1.5 enrichment: service mapping, pricing, WAF, migration path, advisor, reference architectures |
| 22 | Cloud team actions | Top 10 actions filtered by `owner: cloud_team` |

---

## Step 7 — Enable Azure MCP Services (optional)

The Azure MCP servers run as separate Docker containers started with the `mcp` profile.

### 7a — Create an Azure Service Principal

```bash
# Login to Azure CLI
az login

# Create Service Principal with Reader role on your subscription
az ad sp create-for-rbac \
  --name "efesto-mcp-server" \
  --role "Reader" \
  --scopes /subscriptions/<SUBSCRIPTION_ID>
```

Output — copy these values into `.env`:

```json
{
  "appId":       "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   ← AZURE_CLIENT_ID
  "password":    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", ← AZURE_CLIENT_SECRET
  "tenant":      "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"    ← AZURE_TENANT_ID
}
```

Get the subscription ID:
```bash
az account show --query id -o tsv    # ← AZURE_SUBSCRIPTION_ID
```

Verify the Service Principal works:
```bash
az login --service-principal \
  --tenant $AZURE_TENANT_ID \
  --username $AZURE_CLIENT_ID \
  --password $AZURE_CLIENT_SECRET

az account set --subscription $AZURE_SUBSCRIPTION_ID
az resource list --output table     # should list resources
```

**Required RBAC roles:**

| Role | Scope | Purpose |
|---|---|---|
| `Reader` | Subscription | Read resources, advisor, health |
| `Cost Management Reader` | Subscription | Pricing and cost data |

For Azure Migrate write capabilities (assessment creation): add `Contributor` on the Azure Migrate resource group.

### 7b — Add MCP variables to `.env`

```env
# ── Azure Identity (for mcp-azure container) ──────────────────────
AZURE_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
AZURE_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
AZURE_CLIENT_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
AZURE_SUBSCRIPTION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# ── Azure MCP server ───────────────────────────────────────────────
# Backend on HOST (local dev):      http://localhost:3333/sse
# Backend in Docker container:      http://mcp-azure:3333/sse
AZURE_MCP_SERVER_URL="http://localhost:3333/sse"
AZURE_MCP_SERVER_ENABLED=true

# ── Azure DevOps MCP server ────────────────────────────────────────
AZURE_DEVOPS_ORG="mycompany"          # your Azure DevOps organization name
AZURE_DEVOPS_EXT_PAT="xxxxxxxxx"      # PAT with: Code(Read), Work Items(Read), Build(Read)
# Backend on HOST (local dev):      http://localhost:3334/sse
# Backend in Docker container:      http://mcp-devops:3334/sse
AZURE_DEVOPS_MCP_SERVER_URL="http://localhost:3334/sse"
AZURE_DEVOPS_MCP_SERVER_ENABLED=true
```

> **How MCP enrichment works (local client)**: The backend connects to MCP servers via SSE directly from the Python process — no Anthropic MCP beta required. This means Docker-internal or localhost URLs both work, as long as the backend can reach them. The `mcp` Python SDK (`mcp[cli]`) handles the SSE transport and tool execution locally.

**How to create a DevOps PAT:**
1. Go to `https://dev.azure.com/{org}` → User Settings → Personal Access Tokens
2. New Token → Scopes: `Code (Read)`, `Work Items (Read)`, `Build (Read)`, `Wiki (Read)`
3. Copy the token into `AZURE_DEVOPS_EXT_PAT`

### 7c — Start MCP containers

```bash
# Start only the MCP services
docker compose --profile mcp up -d mcp-azure mcp-devops

# Or start the full stack including MCP
docker compose --profile mcp up -d

# Check status
docker compose ps

# View Azure MCP server logs
docker compose logs -f mcp-azure
docker compose logs -f mcp-devops
```

The containers expose SSE endpoints on two addresses:

| Run mode | Azure MCP | Azure DevOps MCP |
|---|---|---|
| Backend on host (local dev) | `http://localhost:3333/sse` | `http://localhost:3334/sse` |
| Backend in Docker container | `http://mcp-azure:3333/sse` | `http://mcp-devops:3334/sse` |

Set `AZURE_MCP_SERVER_URL` / `AZURE_DEVOPS_MCP_SERVER_URL` in `.env` accordingly. The frontend only sends the enable/disable toggle — URLs are managed server-side.

### 7d — Run an analysis with MCP enrichment

1. In the Analysis form → **Section 4 — MCP Enrichment Sources**
2. Toggle **Azure MCP** and/or **Azure DevOps MCP** to ON
3. Start the analysis
4. The report will include an **Azure MCP Enrichment** panel with real Azure data

### 7e — Troubleshooting MCP containers

| Symptom | Cause | Fix |
|---|---|---|
| `azmcp: not found` | Alpine musl vs glibc binary | Image uses `node:22-slim` (Debian/glibc) — rebuild |
| `Couldn't find a valid ICU package` | .NET globalization deps missing | `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` set in Dockerfile |
| `fetch failed` on Azure DevOps | Corporate SSL inspection proxy | `NODE_TLS_REJECT_UNAUTHORIZED=0` set in compose.yml |
| `Not enough non-option arguments` | Missing `organization` positional arg | `AZURE_DEVOPS_ORG` must be set in `.env` |
| `Access to this MCP server is blocked` | Anthropic MCP beta tried to reach local URL | Fixed — only `McpEnrichmentAgent` uses MCP via local SSE client |
| Phase 2 agents fail with 400/500 when MCP enabled | base_agent was passing MCP servers to Anthropic beta | Fixed — `base_agent` uses standard API; Phase 2 agents get MCP data via context |
| Rate limit 429 in MCP loop | Claude Opus + many tool calls | Fixed — Haiku used for MCP loop; exits gracefully on 429 |
| `unhandled errors in a TaskGroup` | `BaseExceptionGroup` not caught by `except Exception` | Fixed — `except BaseException` with re-raise for SystemExit |
| DevOps MCP: SSE opens then closes immediately | `@azure-devops/mcp` crashes at init (SSL or auth failure) | Caught gracefully with 3-attempt retry; enrichment continues with Azure MCP only. Verify `AZURE_DEVOPS_EXT_PAT` and `AZURE_DEVOPS_ORG`. On corporate networks, mount the CA bundle and set `NODE_EXTRA_CA_CERTS` inline in the CMD (see Dockerfile.mcp-devops) |
| `NODE_EXTRA_CA_CERTS` wrong path in container | Claude Code `settings.json` `env` leaks host Windows path via Docker Desktop / Git Bash (backslashes stripped) | Fixed — `NODE_EXTRA_CA_CERTS` set inline in Dockerfile CMD as `sh -c "NODE_EXTRA_CA_CERTS=<container-path> supergateway ..."` |
| `code_analyzer: Could not parse JSON response` | Large code response truncated — OWASP/SOLID/12-Factor output requires more tokens | Fixed — `max_tokens` raised to 8192 |
| `infra_analyzer: Could not parse JSON response` | Large infra response truncated (max_tokens too small) OR Claude returned JSON array instead of object | Fixed — `max_tokens` raised to 8192; `parse_response` now normalises JSON arrays to objects |
| `synthesis: Input should be a valid dictionary, input_type=list` | Claude returns a JSON array `[...]` instead of object `{...}` for the synthesis step | Fixed — orchestrator normalises list → dict before Pydantic validation |
| `Already connected to a transport` (supergateway crash) | `Server.close()` in `@modelcontextprotocol/sdk` calls `transport.close()` but never resets `_transport`; the `onclose` event (which does reset it) doesn't fire on an already-ended HTTP response — so every 2nd SSE connection throws | Fixed — `Dockerfile.mcp-azure` patches `stdioToSse.js` at build time to set `server._transport = undefined` after `close()` |
| `Server disconnected without sending a response` | SSE session dropped after uvicorn hot-reload | Fixed — SSE connect retried up to 3 times with 2s backoff before giving up |
| `SONARCLOUD_TOKEN not set — skipping SonarCloud` | Settings `lru_cache` loaded before `.env` update | Restart the backend after editing `.env`. Both `SONARCLOUD_TOKEN` and `SONARCLOUD_ORG` must be set |
| `Bind for 0.0.0.0:9005 failed: port already allocated` | `compose.local.yml` and `compose.yml` both tried to bind MinIO on 9005 | Fixed — `compose.yml` now maps MinIO to host ports **9007/9008**; MongoDB has no host binding. Set `MINIO_PUBLIC_ENDPOINT=http://localhost:9007` when using full-stack Docker mode |
| `Azure MCP Enrichment` panel shows only `Quality: unknown` | `AgentResultSummary` was not including the `data` field — enrichment payload was stripped before reaching the frontend | Fixed — API route now includes `data` for `mcp_enrichment`, `code_analyzer`, `infra_analyzer`, and `quality_analyzer` |
| Synthesis sections all empty (no Executive Summary / Strategy / Findings) | Synthesis prompt was too large — `raw`, `sonarqube_analysis`, `mcp_guidance`, `mcp_infra_guidance` fields duplicated all data, causing Claude to produce empty JSON. Also `max_tokens=4096` was too small for all synthesis sections | Fixed — `_compact_for_synthesis()` strips heavy/redundant fields; synthesis `max_tokens` raised to 8192; `try/except` fallback prevents total analysis failure if synthesis JSON parse fails |
| Maturity Score always 0 | Depends on empty synthesis — see row above | Fixed with synthesis fixes above |
| Cloud Coupling shows `UNKNOWN` even though coupling was detected | `parse_response` defaulted to `"UNKNOWN"` if top-level `coupling_score` key was missing, ignoring `cloud_coupling.coupling_level` | Fixed — added fallback chain: `coupling_score` → `cloud_coupling.coupling_level` → `cloud_coupling.coupling_score` → `"UNKNOWN"` |
| `infra_analyzer` data (WAF, CIS, CAF, `mcp_infra_guidance`) not visible in UI | `infra_analyzer` was missing from the `data` allow-list in `analysis.py` | Fixed — `infra_analyzer` added to allow-list |
| `service_mapping` or `resource_inventory` items cause `'str' object has no attribute 'get'` | Claude occasionally returns those lists as strings instead of dicts | Fixed — `_detect_service_patterns` and `_enrich_with_mcp` now guard with `isinstance(s, dict)` |

---

## Run the full stack in Docker (production-like local)

```bash
# Full stack without MCP services
docker compose up --build -d

# Full stack with MCP services
docker compose --profile mcp up --build -d

# Check status
docker compose ps

# View logs
docker compose logs -f api
```

| Service | URL |
|---|---|
| Client (Nginx) | [http://localhost:3000](http://localhost:3000) |
| API (FastAPI) | [http://localhost:8000](http://localhost:8000) |
| MinIO S3 API | [http://localhost:9007](http://localhost:9007) |
| MinIO Console | [http://localhost:9008](http://localhost:9008) |
| Azure MCP SSE | [http://localhost:3333/sse](http://localhost:3333/sse) |
| Azure DevOps MCP SSE | [http://localhost:3334/sse](http://localhost:3334/sse) |

> **Port allocation**: `compose.yml` uses MinIO on **9007/9008** to avoid conflicting with `compose.local.yml` which binds 9005/9006. MongoDB in `compose.yml` has no host binding (API uses Docker-internal `mongodb:27017`). Both stacks can run simultaneously.

---

# Azure Deployment — Step by Step

## Azure Prerequisites

- Azure CLI installed and authenticated: `az login`
- Subscription with quota for Azure OpenAI GPT-4o
- Azure Container Registry (ACR) for Docker images
- Azure AI Foundry Hub (optional, for `use_foundry_mode=true`)

---

## Step 1 — Login and select subscription

```bash
az login
az account set --subscription "<subscription-id>"
az account show --query "{name:name, id:id}" -o table
```

---

## Step 2 — Deploy infrastructure with Bicep

```bash
az deployment sub create \
  --name "efesto-dev-$(date +%Y%m%d)" \
  --location westeurope \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam \
  --parameters prefix=afaf environmentName=dev
```

Resources created:

| Resource | Pattern | Purpose |
|---|---|---|
| Container Apps Environment | `cae-afaf-dev` | Hosting backend + frontend |
| Container App (API) | `ca-api-afaf-dev` | FastAPI backend |
| Container App (Client) | `ca-client-afaf-dev` | React frontend |
| Cosmos DB (MongoDB API) | `cosmos-afaf-dev` | State store |
| Azure OpenAI | `oai-afaf-dev` | LLM (GPT-4o) |
| AI Search | `srch-afaf-dev` | Knowledge base CAF/WAF |
| Key Vault | `kv-afaf-dev` | Secrets management |
| Log Analytics | `log-afaf-dev` | Observability |

---

## Step 3 — Build and push Docker images

```bash
ACR_NAME=$(az acr list --resource-group rg-afaf-dev --query "[0].name" -o tsv)
az acr login --name $ACR_NAME

docker build -t $ACR_NAME.azurecr.io/efesto-api:latest -f docker/Dockerfile.api .
docker push $ACR_NAME.azurecr.io/efesto-api:latest

docker build -t $ACR_NAME.azurecr.io/efesto-client:latest -f docker/Dockerfile.client .
docker push $ACR_NAME.azurecr.io/efesto-client:latest
```

---

## Step 4 — Assign RBAC roles (Managed Identity)

```bash
chmod +x scripts/setup-rbac.sh
./scripts/setup-rbac.sh dev
```

---

## Step 5 — Configure secrets in Key Vault

```bash
KV_NAME="kv-afaf-dev"

az keyvault secret set --vault-name $KV_NAME --name "anthropic-api-key" --value "sk-ant-..."
az keyvault secret set --vault-name $KV_NAME --name "sonarcloud-token" --value "<token>"
az keyvault secret set --vault-name $KV_NAME --name "azure-mcp-client-secret" --value "<SP-secret>"
```

---

## Step 6 — Configure Azure Blob Storage

```bash
az storage account create \
  --name "stafaf${ENV}" \
  --resource-group rg-afaf-dev \
  --location westeurope \
  --sku Standard_LRS \
  --allow-blob-public-access false
```

```env
STORAGE_BACKEND=azure
AZURE_STORAGE_ACCOUNT_NAME=stafafdev
AZURE_STORAGE_CONNECTION_STRING=   # leave empty → uses Managed Identity
AZURE_STORAGE_CONTAINER=efesto-artifacts
```

---

## Step 7 — Deploy to Container Apps

```bash
az containerapp update \
  --name ca-api-afaf-dev \
  --resource-group rg-afaf-dev \
  --image $ACR_NAME.azurecr.io/efesto-api:latest \
  --set-env-vars \
    LLM_PROVIDER=azure \
    APP_ENV=production \
    STORAGE_BACKEND=azure \
    AZURE_STORAGE_ACCOUNT_NAME="stafafdev" \
    AZURE_STORAGE_CONTAINER="efesto-artifacts" \
    AZURE_MCP_SERVER_URL="http://mcp-azure:3333/sse" \
    AZURE_MCP_SERVER_ENABLED=true \
    AZURE_TENANT_ID="..." \
    AZURE_CLIENT_ID="..." \
    CLAUDE_INPUT_PRICE_PER_1M_USD=15.0 \
    CLAUDE_OUTPUT_PRICE_PER_1M_USD=75.0 \
    EUR_USD_RATE=0.92 \
    MONTHLY_BUDGET_EUR=100.0
```

---

## Step 8 — Verify the deployment

```bash
az containerapp show \
  --name ca-client-afaf-dev \
  --resource-group rg-afaf-dev \
  --query "properties.configuration.ingress.fqdn" -o tsv

curl https://$(az containerapp show \
  --name ca-api-afaf-dev -g rg-afaf-dev \
  --query "properties.configuration.ingress.fqdn" -o tsv)/health
```

---

## Local → Production — key variable mapping

| Variable | Local | Production |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `azure` |
| `STORAGE_BACKEND` | `minio` | `azure` |
| `MONGODB_URI` | `mongodb://admin:...@localhost:27017` | Cosmos DB connection string |
| `REDIS_URI` | `redis://localhost:6379/0` | Azure Cache for Redis URI |
| `APP_ENV` | `development` | `production` |
| `AZURE_MCP_SERVER_URL` | `http://mcp-azure:3333/sse` | Internal Container App URL |
| `AZURE_DEVOPS_MCP_SERVER_URL` | `http://mcp-devops:3334/sse` | Internal Container App URL |

---

# API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analysis/start` | Start async analysis (Redis cache checked first) |
| `GET` | `/api/analysis/{id}/status` | Poll: `running` / `completed` / `failed` |
| `GET` | `/api/analysis/{id}` | Full report with token totals |
| `GET` | `/api/analysis/` | List all sessions |
| `POST` | `/api/analysis/quick-scan` | Synchronous (small projects, 120s timeout) |
| `POST` | `/api/artifacts/presign` | Presigned PUT URL for MinIO/Blob upload |
| `POST` | `/api/artifacts/upload-to-volume` | Upload to Docker volume `/app/uploads` |
| `DELETE` | `/api/artifacts/{key}` | Delete from storage |
| `GET` | `/api/artifacts/volume-tree` | List volume files |
| `GET` | `/health` | Health check |

### Analysis request — full example

```json
{
  "project_name": "my-api",
  "source_cloud": "aws",
  "target_cloud": "azure",
  "analysis_types": ["all"],
  "current_monthly_cost_usd": 5000,
  "additional_context": "Microservices on ECS, PostgreSQL RDS, target Azure PaaS",
  "source_config": {
    "type": "github",
    "repo_url": "https://github.com/org/repo",
    "branch": "main",
    "token": "ghp_...",
    "code_folder": "src",
    "iac_folder": "infra"
  },
  "mcp_servers": [
    {
      "id": "azure-mcp-internal",
      "name": "Azure MCP",
      "type": "url",
      "enabled": true,
      "cloud": "azure",
      "preconfigured": true
    },
    {
      "id": "azure-devops-mcp-internal",
      "name": "Azure DevOps MCP",
      "type": "url",
      "enabled": true,
      "cloud": "devops",
      "preconfigured": true
    }
  ],
  "use_foundry_mode": false
}
```

> **Pre-configured servers**: when `preconfigured: true`, the URL is injected server-side from `AZURE_MCP_SERVER_URL` / `AZURE_DEVOPS_MCP_SERVER_URL`. The client sends only the toggle.

### Analysis response — token fields

```json
{
  "session_id": "uuid",
  "project_name": "my-api",
  "status": "completed",
  "synthesis": { "maturity_score": 3.2, "recommended_strategy": "replatform", "..." : "..." },
  "agent_results": {
    "code_analyzer":   { "status": "success", "input_tokens": 8200, "output_tokens": 1450, "cost_eur": 0.0225 },
    "infra_analyzer":  { "status": "success", "input_tokens": 6100, "output_tokens": 980,  "cost_eur": 0.0165 },
    "mcp_enrichment":  { "status": "success", "input_tokens": 12400, "output_tokens": 2100, "cost_eur": 0.0345 },
    "cost_optimizer":  { "status": "success", "input_tokens": 9800, "output_tokens": 1600, "cost_eur": 0.0267 }
  },
  "total_input_tokens": 48200,
  "total_output_tokens": 8300,
  "total_cost_eur": 0.142,
  "created_at": 1712345678.0
}
```

---

# SonarCloud Integration

```env
SONARCLOUD_TOKEN=<user-token>   # sonarcloud.io → My Account → Security → Generate Token
SONARCLOUD_ORG=bigonil          # Organization key (Org Settings → Key)
```

The `code_analyzer` fetches before calling Claude: Quality Gate, bugs, vulnerabilities, hotspots, smells, coverage, duplication, technical debt, LOC, ratings (A–E), top issues.

---

# Redis Cache — Two Levels

| Level | Key | TTL | Effect |
|---|---|---|---|
| **Report** | SHA-256 of full request | 24h | Identical request → immediate response, 0 Claude calls |
| **Per-agent** | SHA-256 of agent inputs | 48h | Reuses agent result across different analyses |

Token counts are restored from cache for all agents (Phase 1 and Phase 2) so the Per-Agent Breakdown always shows accurate token data even on cached runs.

---

# Migration Effort Formula

```
final_days = base_days × strategy_factor × risk_multiplier
```

| Strategy | Factor | Risk | Multiplier |
|---|---|---|---|
| Rehost | × 1.0 | Low | × 1.0 |
| Replatform | × 1.5 | Medium | × 1.3 |
| Refactor | × 3.0 | High | × 1.6 |

**Base days per component:**

| Component | Base days |
|---|---|
| Compute service | 5 d |
| Database | 10 d (+ 5 if schema migration) |
| Messaging / queue | 4 d |
| Storage | 3 d |
| Networking / VNet | 8 d flat |
| IAM / Identity | 6 d flat |
| Monitoring setup | 4 d flat |
| CI/CD pipeline | 3 d / pipeline |
| Testing & validation | +20% of total |

**Standard daily rates (EUR):**

| Role | Rate/day |
|---|---|
| Cloud Architect | €1,200 |
| Cloud Engineer | €900 |
| DevOps / Platform Engineer | €850 |
| Application Developer | €750 |
| Security Engineer | €1,000 |
| Project Manager | €800 |

1 person-day = 8 hours.

---

# WAF Compliance

| Pillar | Implementation |
|---|---|
| **Reliability** | Health probe, retry logic, graceful degradation (Redis, SonarCloud, MCP) |
| **Security** | Managed Identity (prod), Key Vault, no secrets in code, Service Principal for MCP |
| **Cost Optimization** | Redis cache (avoids redundant Claude calls), token tracking with budget bar, real Azure pricing via MCP |
| **Operational Excellence** | IaC Bicep, structured logging, `/health` endpoint, async job pattern, Docker profiles for optional services |
| **Performance** | Parallel agent execution (asyncio), two-level Redis cache, Phase 1.5 MCP enrichment optional and non-blocking |
