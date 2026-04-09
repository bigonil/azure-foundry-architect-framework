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
| Object storage | MinIO (Docker, porta 9005) | Azure Blob Storage |
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
| `code_analyzer` | 1 | App code + SonarCloud | Language inventory, cloud coupling, tech debt, quality gate |
| `infra_analyzer` | 1 | IaC analysis | Resource inventory, networking, security posture, service mapping |
| `mcp_enrichment` | 1.5 | Azure Skills enrichment | Migration readiness, real pricing, Advisor recs, WAF, reference archs |
| `cost_optimizer` | 2 | FinOps | Savings, reserved instance ROI, right-sizing |
| `migration_planner` | 2 | CAF migration | 6Rs strategy, wave plan, effort detail, risk register |
| `gap_analyzer` | 2 | GAP analysis | Current vs target across 7 dimensions |
| `waf_reviewer` | 2 | WAF review | 5-pillar scoring with recommendations |
| `quality_analyzer` | 2 | Quality gate | SonarQube-level code & IaC analysis |

> **Phase 1.5** runs only when at least one Azure MCP server is active. Failures are non-fatal — the pipeline continues without enrichment data.

---

## Project Structure

```
azure-foundry-architect-framework/
├── src/
│   ├── agents/
│   │   ├── base_agent.py             # Abstract base — standard messages API only (no MCP beta)
│   │   ├── orchestrator.py           # Phases 1→1.5→2→3, _build_mcp_servers, token aggregation
│   │   ├── code_analyzer.py          # + SonarCloud enrichment
│   │   ├── infra_analyzer.py
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
│       │   └── ReportPage.tsx        # McpEnrichmentPanel + TokenCostPanel + EffortDetail
│       └── services/api.ts           # McpServerConfig + preconfigured/authorization_token
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

### Maturity Score

Displayed in the report header. Computed by Claude during synthesis (Phase 3), scored 1.0–5.0:

| Score | Meaning |
|---|---|
| 1.0–2.0 | Legacy / high migration risk |
| 2.0–3.5 | Moderate coupling, refactoring required |
| 3.5–5.0 | Cloud-native / migration-ready |

Based on: **code quality** (SonarCloud metrics + static analysis) + **cloud coupling score** (how tightly the code is bound to the source provider) + **infrastructure complexity** (resource count, service dependencies).

### MCP Enrichment — Phase 1.5

When Azure MCP servers are active, a dedicated **MCP Enrichment Agent** runs between Phase 1 and Phase 2. It calls Azure Skills to retrieve **real Azure intelligence** and injects it into the synthesis prompt — so the final report uses actual pricing, actual migration readiness scores, and real Azure Advisor recommendations instead of estimates.

**Implementation**: Only `McpEnrichmentAgent` (Phase 1.5) interacts with MCP. All other agents (Phase 1 and Phase 2) use the standard Anthropic messages API and receive MCP enrichment data already injected into their context. This avoids the Anthropic MCP beta limitation where server URLs must be publicly reachable from Anthropic's cloud.

The MCP tool-use loop connects to servers via local SSE (`mcp[cli]` Python SDK + `AsyncExitStack`) and uses **`claude-haiku-4-5-20251001`** (configurable via `ANTHROPIC_MODEL_MCP`) to stay within rate limits across 10–30 tool calls per analysis. Rate limit errors exit the loop gracefully and return partial results.

**`azuremigrate` is always called first** (mandatory pre-call before the Claude loop). The backend invokes it directly via `sess.call_tool()` before entering the Claude tool-use loop — guaranteeing migration assessment data is captured regardless of Claude’s tool selection. The raw result is injected into Claude’s initial message and stored verbatim as `azure_migrate_raw` in the report (shown in a collapsible block in the UI). SSE connections include a **3-attempt retry with 2s backoff** to survive transient disconnects (e.g. after a uvicorn hot-reload).

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

> **Note on Azure DevOps Remote MCP**: The remote endpoint `https://mcp.dev.azure.com/{org}` requires Entra OAuth and currently does **not** support the Anthropic API MCP client. The Docker service uses the local **`@azure-devops/mcp`** package (v2.5.0+) authenticated via PAT (`--authentication env`). On corporate networks with SSL inspection, `NODE_TLS_REJECT_UNAUTHORIZED=0` is set in the container (replace with `NODE_EXTRA_CA_CERTS` + mounted CA cert for production).

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

| Section | Content |
|---|---|
| Agent Status Bar | Each agent status, duration, token usage |
| **Token & Cost Panel** | Total tokens, EUR cost, budget bar, per-agent breakdown |
| **Azure MCP Enrichment** | Skills called, **Azure Migrate assessment** (score + suitability + blockers + raw output), real pricing + breakdown, Advisor recs (all, with category/impact), WAF scores + findings, reference architectures (with fit scores), per-service SKU guidance, best practices |
| Executive Summary | C-level summary with EUR values |
| Strategy / Timeline / Savings | 6R strategy, weeks, monthly savings |
| Key Findings & Risks | Agent-derived findings and critical risks |
| Recommended Actions | Top 10 actions with owner, timeline, effort, impact |
| Migration Roadmap | Phase-by-phase with objectives and milestones |
| **Migration Effort Detail** | Person-days, hours, team allocation (roles + EUR rates), wave breakdown |
| SonarCloud Analysis | Quality gate, ratings (A–E), metrics, top issues |

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
| DevOps MCP: SSE opens then closes immediately | `@azure-devops/mcp` crashes at init (SSL or auth failure) | Caught gracefully with 3-attempt retry; enrichment continues with Azure MCP only. Verify `AZURE_DEVOPS_EXT_PAT` and `AZURE_DEVOPS_ORG` |
| `infra_analyzer: Could not parse JSON response` | Large infra response truncated (max_tokens too small) OR Claude returned JSON array instead of object | Fixed — `max_tokens` raised to 8192; `parse_response` now normalises JSON arrays to objects |
| `Server disconnected without sending a response` | SSE session dropped after uvicorn hot-reload | Fixed — SSE connect retried up to 3 times with 2s backoff before giving up |
| `SONARCLOUD_TOKEN not set — skipping SonarCloud` | Settings `lru_cache` loaded before `.env` update | Restart the backend after editing `.env`. Both `SONARCLOUD_TOKEN` and `SONARCLOUD_ORG` must be set |

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

The client is served at [http://localhost:3000](http://localhost:3000).
The API is at [http://localhost:8000](http://localhost:8000).

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
