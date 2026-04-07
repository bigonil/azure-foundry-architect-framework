# Efesto — AI Fabryc

Multi-agent AI system for cloud architecture analysis, migration planning, cost optimization,
and Well-Architected Framework review. Built on **Azure AI Foundry** (production) and
**Claude Opus 4.6 by Anthropic** (local MVP mode), following Microsoft **CAF** and **WAF** best practices.

---

## Component Matrix

| Component | Local (MVP) | Production (Azure) |
|---|---|---|
| LLM | Claude Opus 4.6 (Anthropic API) | Azure OpenAI GPT-4o |
| Active agents | Code Analyzer + Infra Analyzer | All 7 agents |
| State store | MongoDB 7 (Docker) | Azure Cosmos DB |
| Cache | Redis 7 (Docker) | Azure Cache for Redis |
| Object storage | MinIO (Docker, porta 9005) | Azure Blob Storage |
| Static analysis | SonarCloud REST API | SonarCloud REST API |
| Artifact sources | Upload / MinIO / Volume / Git clone | Upload / Blob Storage / Git clone |
| MCP enrichment | Toggleable (URL-type, Anthropic beta) | Toggleable (URL-type, Anthropic beta) |
| Token tracking | Per-agent + synthesis, EUR cost | Per-agent + synthesis, EUR cost |
| Hosting | localhost | Azure Container Apps |

---

## Architecture Overview

![Architecture — Azure and Local deployment](docs/architecture.png)

```
┌─────────────────────────────────────────────────────────────────┐
│                        User / Frontend                          │
│           React SPA (Vite + Tailwind) — MVP Mode badge         │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API
┌────────────────────────────▼────────────────────────────────────┐
│                      FastAPI Backend                            │
│   POST /start → 202 async   GET /status   GET /report          │
│   POST /artifacts/presign   Redis cache (2 levels)             │
│   Token tracking (in/out per agent + synthesis + total EUR)    │
└────────────────────────────┬────────────────────────────────────┘
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐
   │   MongoDB   │   │    Redis     │   │ MinIO / Azure   │
   │  (sessions  │   │  (2-level    │   │ Blob Storage    │
   │   reports)  │   │   cache)     │   │  (artifacts)    │
   └─────────────┘   └──────────────┘   └─────────────────┘
                             │
                   ┌─────────▼─────────┐
                   │  Orchestrator     │
                   │  Agent            │
                   └─────────┬─────────┘
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   ┌──────────────────┐             ┌──────────────────┐
   │  Code Analyzer   │             │  Infra Analyzer  │
   │  + SonarCloud    │             │                  │
   └──────────────────┘             └──────────────────┘
            │  Phase 2 — coming soon
            ▼
   ┌──────────────────────────────────────────┐
   │  Cost Opt │ Migration │ GAP │ WAF │ QA   │
   └──────────────────────────────────────────┘
```

---

## Specialist Agents

| Agent | MVP | Role | Key Outputs |
|---|---|---|---|
| `code_analyzer` | ✅ Active | App code + SonarCloud | Language inventory, cloud coupling, tech debt, quality gate |
| `infra_analyzer` | ✅ Active | IaC analysis | Resource inventory, networking, security posture |
| `cost_optimizer` | ⏳ Soon | FinOps | Savings, reserved instance ROI |
| `migration_planner` | ⏳ Soon | CAF migration | 6Rs strategy, wave plan, effort detail, risk register |
| `gap_analyzer` | ⏳ Soon | GAP analysis | Current vs target across 7 dimensions |
| `waf_reviewer` | ⏳ Soon | WAF review | 5-pillar scoring with recommendations |
| `quality_analyzer` | ⏳ Soon | Quality gate | SonarQube-level code & IaC analysis |

---

## Project Structure

```
azure-foundry-architect-framework/
├── src/
│   ├── agents/
│   │   ├── base_agent.py          # Abstract base (Anthropic + MCP beta + Azure + Foundry)
│   │   ├── orchestrator.py        # Master coordinator + token aggregation + per-agent cache
│   │   ├── code_analyzer.py       # + SonarCloud enrichment
│   │   ├── infra_analyzer.py
│   │   ├── cost_optimizer.py
│   │   ├── migration_planner.py   # + effort_detail (person-days, roles, waves, EUR cost)
│   │   ├── gap_analyzer.py
│   │   ├── waf_reviewer.py
│   │   └── quality_analyzer.py
│   ├── tools/
│   │   ├── blob_storage.py        # MinIO (boto3) + Azure Blob (azure-storage-blob)
│   │   ├── git_importer.py        # Async shallow clone: GitHub + Azure DevOps
│   │   ├── volume_reader.py       # Read artifacts from /app/uploads volume
│   │   ├── code_scanner.py        # Language/framework/SDK detection
│   │   ├── infra_parser.py        # Terraform/Bicep/K8s parsing
│   │   ├── pricing_calculator.py  # Azure Pricing API client
│   │   └── sonarcloud_client.py   # SonarCloud REST API client
│   ├── cache/
│   │   └── redis_cache.py         # Two-level Redis cache (report + per-agent)
│   ├── api/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   ├── analysis.py        # /start /status /report /quick-scan
│   │   │   └── artifacts.py       # /presign /upload-to-volume /delete
│   │   └── models/
│   │       ├── requests.py        # AnalysisRequestBody + SourceConfig + McpServerConfig
│   │       └── responses.py       # AgentResultSummary + token fields + AnalysisReportResponse
│   └── config/
│       ├── settings.py            # Pydantic Settings (all env vars, including pricing)
│       └── prompts/               # YAML system prompts per agent
├── client/                        # React + Vite + Tailwind SPA
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── AnalysisPage.tsx   # 5 artifact tabs + MCP toggles
│       │   └── ReportPage.tsx     # Token panel + effort detail + SonarCloud
│       └── services/api.ts
├── infra/                         # Azure Bicep (production IaC)
│   ├── main.bicep
│   └── modules/
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.client
│   └── nginx.conf
├── scripts/
│   └── setup-rbac.sh             # RBAC role assignments post-deploy
├── docs/
│   └── MinIo_GitClone_Vol.md     # Storage architecture analysis
├── compose.local.yml              # MongoDB + Redis + MinIO (local dev, no build)
├── compose.yml                    # Full stack (production-like Docker, includes build)
├── pyproject.toml
├── .env.example
└── .env                           # Local secrets (never commit)
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
- Per-agent breakdown with proportional bars
- Remaining budget and percentage used (color-coded)

### MCP Enrichment Sources (Beta)
Analysis agents can optionally call external **MCP servers** for live cloud context.
Uses Anthropic's MCP client beta: `betas=["mcp-client-2025-04-04"]`.

Preset servers (toggled from the UI):

| Server | Cloud | Type | Notes |
|---|---|---|---|
| Azure MCP | Azure | url | Requires hosted HTTP/SSE endpoint |
| Azure DevOps MCP | Azure DevOps | url | Requires hosted HTTP/SSE endpoint |
| AWS CDK MCP | AWS | stdio | Requires local process setup |
| AWS Docs MCP | AWS | stdio | Requires local process setup |
| AWS Cost MCP | AWS | stdio | Requires local process setup |
| GCP MCP | GCP | stdio | Requires local process setup |

**URL-type** servers are injected into the Anthropic call when enabled and a URL is set.
**Stdio-type** servers require a running local process; convert to a URL endpoint (e.g. via an HTTP proxy) to activate.

### Detailed Migration Effort
The `migration_planner` agent outputs an `effort_detail` block with:
- **Total person-days and hours** (base × strategy factor × risk multiplier)
- **Calculation method** explanation
- **Team roles** with allocation %, person-days, daily rate EUR, total labour cost
- **Wave planning** (Wave 0: Foundation → Wave 3: Complex workloads)
- **Per-component complexity** (base days → final days with strategy + risk applied)

Strategy factors: Rehost ×1.0, Replatform ×1.5, Refactor ×3.0.
Risk multipliers: Low ×1.0, Medium ×1.3, High ×1.6.

### Artifact Source Options

| Tab | How it works | Best for |
|---|---|---|
| **File Upload** | Drag & drop files + "Add Folder" button (browser → JSON body) | Quick tests, small projects |
| **Object Storage** | Presigned PUT → MinIO/Azure Blob (browser → storage direct) | Large files, production parity |
| **Local Volume** | Backend reads `/app/uploads` at analysis start | CI/CD, persistent reuse |
| **GitHub** | Server-side shallow clone (`--depth 1`) | Code on GitHub |
| **Azure DevOps** | Server-side shallow clone with PAT | Code on Azure DevOps |

The **Persist to volume** toggle in the File Upload tab saves a copy to `/app/uploads`
and shows the paths for reuse in the Local Volume tab.

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

Open `.env` and fill in at minimum the mandatory variables:

```env
# ── LLM (mandatory) ───────────────────────────────────────────────
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...          # https://console.anthropic.com → API Keys
ANTHROPIC_MODEL=claude-opus-4-6

# ── MongoDB ───────────────────────────────────────────────────────
MONGO_ROOT_PASSWORD=changeme_local
MONGODB_URI=mongodb://admin:changeme_local@localhost:27017/efesto-fabryc?authSource=admin
MONGODB_DATABASE=efesto-fabryc

# ── Redis ─────────────────────────────────────────────────────────
REDIS_URI=redis://localhost:6379/0

# ── SonarCloud (optional) ─────────────────────────────────────────
SONARCLOUD_TOKEN=                     # sonarcloud.io → My Account → Security
SONARCLOUD_ORG=bigonil

# ── Object Storage (optional — required for "Object Storage" tab) ─
STORAGE_BACKEND=disabled              # change to "minio" to enable MinIO
MINIO_ENDPOINT=http://localhost:9005
MINIO_PUBLIC_ENDPOINT=http://localhost:9005
MINIO_ACCESS_KEY=efesto
MINIO_SECRET_KEY=changeme_local_minio
MINIO_BUCKET=efesto-artifacts

# ── Token pricing (optional — defaults match Claude Opus 4.6) ─────
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

Wait for all services to be **healthy**:

```bash
docker compose -f compose.local.yml ps
```

Expected output:

```
NAME                              STATUS
efesto-fabryc-local-mongodb-1     Up (healthy)
efesto-fabryc-local-redis-1       Up (healthy)
efesto-fabryc-local-minio-1       Up (healthy)
```

> **MinIO** is optional for basic mode. To activate:
> 1. Set `STORAGE_BACKEND=minio` in `.env`
> 2. The backend creates the bucket `efesto-artifacts` automatically on first use
> 3. Web console available at [http://localhost:9006](http://localhost:9006)  
>    Username: `efesto` / Password: value of `MINIO_SECRET_KEY`

---

## Step 4 — Install Python dependencies and start the backend

```bash
# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -e .

# Start backend with hot reload
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: open [http://localhost:8000/health](http://localhost:8000/health)

```json
{ "status": "healthy", "version": "1.0.0" }
```

Interactive API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Step 5 — Start the frontend

Open a new terminal (keep the backend running):

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Step 6 — Using the application

1. **Home** → click **Start Analysis**
2. **Section 1 — Project Information**: enter project name, source cloud, monthly cost
3. **Section 2 — Analysis Scope**: select agents (MVP: Code Analyzer + Infra Analyzer active)
4. **Section 3 — Artifact Source**: choose how to provide code:

   | Scenario | Tab |
   |---|---|
   | Files on your PC | **File Upload** → drag & drop or "Add Folder" |
   | Large files / production parity | **Object Storage** → uploaded directly to MinIO |
   | Code in a Docker-mounted folder | **Local Volume** → specify paths relative to `/app/uploads` |
   | Code on GitHub | **GitHub** → repo URL + branch + PAT (optional for public repos) |
   | Code on Azure DevOps | **Azure DevOps** → Org URL + Project + Repo + PAT (scope: Code read) |

   **Persist to volume toggle** (File Upload tab): saves a copy to `/app/uploads` for reuse
   in the Local Volume tab without re-uploading.

5. **Section 4 — MCP Enrichment Sources** (Beta): toggle MCP servers per cloud.
   For URL-type servers, enter the HTTP/SSE endpoint. Enabled URL servers are
   injected into every Anthropic API call via the MCP client beta.

6. Click **Start Analysis** — the backend processes in the background.
7. The report page polls automatically every 3 seconds until complete.

### Report page outputs

| Section | What you see |
|---|---|
| Agent Status Bar | Each agent's status, duration, and token usage (hover for details) |
| **Token & Cost Panel** | Total tokens in/out, EUR cost, remaining budget bar, per-agent breakdown |
| Executive Summary | C-level summary with EUR monetary values |
| Strategy / Timeline / Savings | Recommended 6R strategy, migration weeks, monthly savings |
| Key Findings & Risks | Agent-derived findings and critical risks |
| Recommended Actions | Top 10 prioritized actions with owner, timeline, effort, impact |
| Migration Roadmap | Phase-by-phase roadmap with objectives and milestones |
| **Migration Effort Detail** | Person-days, hours, team allocation (roles + EUR rates), wave breakdown, component complexity |
| SonarCloud Analysis | Quality gate, ratings (A–E), metrics, top issues |

---

## Using the Local Volume (/app/uploads)

To analyze code without uploading, copy files into the folder that Docker mounts as a volume:

```bash
# Find the physical path of the Docker volume
docker volume inspect efesto-fabryc-local_efesto_uploads

# Or copy directly into a running container
docker cp ./my-project/src efesto-fabryc-local-api-1:/app/uploads/my-project/code
docker cp ./my-project/infra efesto-fabryc-local-api-1:/app/uploads/my-project/iac
```

Then in the form → **Local Volume** tab:
- Code folder: `my-project/code`
- IaC folder: `my-project/iac`

---

## Run the full stack in Docker (production-like local)

```bash
# Build and start all services (API + client + MongoDB + Redis + MinIO)
docker compose up --build -d

# Check status
docker compose ps

# View logs
docker compose logs -f api
```

The client is served at [http://localhost:3000](http://localhost:3000) (nginx).
The API is at [http://localhost:8000](http://localhost:8000).

---

# Azure Deployment — Step by Step

## Azure Prerequisites

- Azure CLI installed and authenticated: `az login`
- Subscription with quota for Azure OpenAI GPT-4o
- Azure AI Foundry Hub (optional, for `use_foundry_mode=true`)
- Azure Container Registry (ACR) for Docker images
- SonarCloud account (optional)

---

## Step 1 — Login and select subscription

```bash
az login
az account set --subscription "<subscription-id>"

# Verify active subscription
az account show --query "{name:name, id:id}" -o table
```

---

## Step 2 — Deploy infrastructure with Bicep

```bash
# Deploy for dev environment
az deployment sub create \
  --name "efesto-dev-$(date +%Y%m%d)" \
  --location westeurope \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam \
  --parameters prefix=afaf environmentName=dev

# Verify the resource group
az group show --name rg-afaf-dev --query "{name:name, location:location}" -o table
```

Resources created by Bicep:

| Resource | Name (pattern) | Purpose |
|---|---|---|
| Container Apps Environment | `cae-afaf-dev` | Hosting backend + frontend |
| Container App (API) | `ca-api-afaf-dev` | FastAPI backend |
| Container App (Client) | `ca-client-afaf-dev` | React frontend |
| Cosmos DB (MongoDB API) | `cosmos-afaf-dev` | State store (sessions + reports) |
| Azure OpenAI | `oai-afaf-dev` | LLM (GPT-4o) |
| AI Search | `srch-afaf-dev` | Knowledge base CAF/WAF |
| Key Vault | `kv-afaf-dev` | Secrets management |
| Log Analytics | `log-afaf-dev` | Observability |
| Virtual Network | `vnet-afaf-dev` | Private endpoints |

---

## Step 3 — Build and push Docker images

```bash
# Get ACR name from deploy output
ACR_NAME=$(az acr list --resource-group rg-afaf-dev --query "[0].name" -o tsv)

# Login to ACR
az acr login --name $ACR_NAME

# Build and push backend
docker build -t $ACR_NAME.azurecr.io/efesto-api:latest -f docker/Dockerfile.api .
docker push $ACR_NAME.azurecr.io/efesto-api:latest

# Build and push frontend
docker build -t $ACR_NAME.azurecr.io/efesto-client:latest -f docker/Dockerfile.client .
docker push $ACR_NAME.azurecr.io/efesto-client:latest
```

---

## Step 4 — Assign RBAC roles (Managed Identity)

```bash
chmod +x scripts/setup-rbac.sh
./scripts/setup-rbac.sh dev
```

The script assigns:
- `Cognitive Services OpenAI User` → Container App can call Azure OpenAI
- `Search Index Data Reader` → Container App can read AI Search indexes
- `Key Vault Secrets User` → Container App can read secrets from Key Vault
- `Storage Blob Data Contributor` → Container App can read/write Azure Blob Storage

---

## Step 5 — Configure secrets in Key Vault

```bash
KV_NAME="kv-afaf-dev"

# Anthropic (if using anthropic mode in Azure)
az keyvault secret set --vault-name $KV_NAME \
  --name "anthropic-api-key" --value "sk-ant-..."

# SonarCloud
az keyvault secret set --vault-name $KV_NAME \
  --name "sonarcloud-token" --value "<token>"

# MongoDB (if not using native Cosmos DB API)
az keyvault secret set --vault-name $KV_NAME \
  --name "mongodb-uri" --value "<connection-string>"
```

---

## Step 6 — Configure Azure Blob Storage (replaces MinIO)

```bash
# Create storage account (if not already created by Bicep)
az storage account create \
  --name "stafaf${ENV}" \
  --resource-group rg-afaf-dev \
  --location westeurope \
  --sku Standard_LRS \
  --allow-blob-public-access false

# Assign Storage Blob Data Contributor to the Container App identity
STORAGE_ID=$(az storage account show \
  --name "stafafdev" -g rg-afaf-dev --query "id" -o tsv)

CA_PRINCIPAL=$(az containerapp show \
  --name ca-api-afaf-dev -g rg-afaf-dev \
  --query "identity.principalId" -o tsv)

az role assignment create \
  --assignee $CA_PRINCIPAL \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID
```

With Managed Identity active, no connection string is needed:

```env
STORAGE_BACKEND=azure
AZURE_STORAGE_ACCOUNT_NAME=stafafdev
AZURE_STORAGE_CONNECTION_STRING=   # leave empty → uses Managed Identity
AZURE_STORAGE_CONTAINER=efesto-artifacts
```

---

## Step 7 — Deploy updated images to Container Apps

```bash
# Update backend with production env vars
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
    CLAUDE_INPUT_PRICE_PER_1M_USD=15.0 \
    CLAUDE_OUTPUT_PRICE_PER_1M_USD=75.0 \
    EUR_USD_RATE=0.92 \
    MONTHLY_BUDGET_EUR=100.0

# Update frontend
az containerapp update \
  --name ca-client-afaf-dev \
  --resource-group rg-afaf-dev \
  --image $ACR_NAME.azurecr.io/efesto-client:latest
```

---

## Step 8 — Verify the deployment

```bash
# Get frontend URL
az containerapp show \
  --name ca-client-afaf-dev \
  --resource-group rg-afaf-dev \
  --query "properties.configuration.ingress.fqdn" -o tsv

# Backend health check
curl https://$(az containerapp show \
  --name ca-api-afaf-dev -g rg-afaf-dev \
  --query "properties.configuration.ingress.fqdn" -o tsv)/health
```

---

## Local → Production migration — key variables

| Variable | Local | Production |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `azure` |
| `STORAGE_BACKEND` | `minio` | `azure` |
| `MINIO_ENDPOINT` | `http://localhost:9005` | — |
| `AZURE_STORAGE_ACCOUNT_NAME` | — | `<account name>` |
| `AZURE_STORAGE_CONNECTION_STRING` | — | empty → Managed Identity |
| `MONGODB_URI` | `mongodb://admin:...@localhost:27017` | Cosmos DB connection string |
| `REDIS_URI` | `redis://localhost:6379/0` | Azure Cache for Redis URI |
| `APP_ENV` | `development` | `production` |
| `CLAUDE_INPUT_PRICE_PER_1M_USD` | `15.0` | `15.0` (update if pricing changes) |
| `MONTHLY_BUDGET_EUR` | `100.0` | set per team/project budget |

---

# API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analysis/start` | Start async analysis (checks Redis cache first) |
| `GET` | `/api/analysis/{id}/status` | Poll status: `running` / `completed` / `failed` |
| `GET` | `/api/analysis/{id}` | Full report (200 when completed) — includes token totals |
| `GET` | `/api/analysis/` | List all sessions |
| `POST` | `/api/analysis/quick-scan` | Synchronous analysis (small projects, 120s timeout) |
| `POST` | `/api/artifacts/presign` | Presigned PUT URL for direct browser upload to MinIO/Blob |
| `POST` | `/api/artifacts/upload-to-volume` | Upload files to Docker volume `/app/uploads` |
| `DELETE` | `/api/artifacts/{key}` | Delete an artifact from storage |
| `GET` | `/api/artifacts/volume-tree` | List files in the volume |
| `GET` | `/health` | Health check |

### Analysis request — full example with MCP servers

```json
{
  "project_name": "my-api",
  "source_cloud": "aws",
  "target_cloud": "azure",
  "analysis_types": ["code_analyzer", "infra_analyzer"],
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
    { "id": "azure-mcp", "name": "Azure MCP", "type": "url", "url": "https://my-azure-mcp.example.com/sse", "enabled": true, "cloud": "azure" }
  ],
  "use_foundry_mode": false
}
```

### Analysis response — token fields

```json
{
  "session_id": "uuid",
  "project_name": "my-api",
  "status": "completed",
  "synthesis": { ... },
  "agent_results": {
    "code_analyzer": {
      "agent_name": "code_analyzer",
      "status": "success",
      "duration_seconds": 12.3,
      "input_tokens": 8200,
      "output_tokens": 1450,
      "cost_eur": 0.0225
    }
  },
  "total_input_tokens": 18400,
  "total_output_tokens": 3200,
  "total_cost_eur": 0.049,
  "created_at": 1712345678.0
}
```

### Source config — all types

**File Upload (default):**
```json
{ "code_artifacts": [{"filename": "app.py", "content": "..."}], "iac_artifacts": [...] }
```

**Object Storage (MinIO / Azure Blob):**
```json
{
  "source_config": {
    "type": "blob",
    "artifacts": [
      { "key": "uploads/code/abc123/app.py", "filename": "app.py", "artifact_type": "code" },
      { "key": "uploads/iac/def456/main.tf", "filename": "main.tf", "artifact_type": "iac" }
    ]
  }
}
```

**Local Volume:**
```json
{
  "source_config": { "type": "volume", "code_folder": "myproject/src", "iac_folder": "myproject/infra" }
}
```

**GitHub:**
```json
{
  "source_config": {
    "type": "github",
    "repo_url": "https://github.com/org/repo",
    "branch": "main",
    "token": "ghp_...",
    "code_folder": "src",
    "iac_folder": "infra"
  }
}
```

**Azure DevOps:**
```json
{
  "source_config": {
    "type": "devops",
    "org_url": "https://dev.azure.com/myorg",
    "project": "MyProject",
    "repo": "my-repo",
    "branch": "main",
    "token": "<PAT>",
    "code_folder": "src",
    "iac_folder": "infra"
  }
}
```

---

# SonarCloud Integration

The `code_analyzer` automatically queries SonarCloud before calling Claude.

**What is fetched:**
- Quality Gate status (OK / ERROR)
- Metrics: bugs, vulnerabilities, security hotspots, code smells, coverage %, duplication %, technical debt, LOC
- Ratings: Reliability, Security, Maintainability (A–E)
- Top open issues (BLOCKER / CRITICAL)

**Configuration:**
```env
SONARCLOUD_TOKEN=<user-token>   # sonarcloud.io → My Account → Security → Generate Token
SONARCLOUD_ORG=bigonil          # Organization key (visible in Org Settings → Key)
```

The project must have been scanned at least once via `sonar-scanner` or a CI/CD pipeline.

---

# Redis Cache — Two Levels

| Level | Cache key | TTL | Effect |
|---|---|---|---|
| **Report** | SHA-256 of the full request | 24h | Identical request → immediate response, 0 Claude calls |
| **Per-agent** | SHA-256 of agent-specific inputs | 48h | Reuses agent result across different analyses |

Redis degrades gracefully — if unavailable, analysis proceeds normally without caching.

---

# Migration Effort Formula

The `migration_planner` agent computes effort using this formula for each component:

```
final_days = base_days × strategy_factor × risk_multiplier
```

| Strategy | Factor | Risk | Multiplier |
|---|---|---|---|
| Rehost (Lift & Shift) | × 1.0 | Low | × 1.0 |
| Replatform (Lift & Reshape) | × 1.5 | Medium | × 1.3 |
| Refactor / Re-architect | × 3.0 | High | × 1.6 |

**Base days per component type:**

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

**Standard role daily rates (EUR):**

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
| **Reliability** | Health probe, retry logic in agents, graceful degradation (Redis, SonarCloud) |
| **Security** | Managed Identity (prod), Key Vault, Private Endpoint (prod), no secrets in code |
| **Cost Optimization** | Redis cache (avoids redundant Claude calls), scale-to-0 Container Apps, all costs in EUR, token tracking with budget bar |
| **Operational Excellence** | IaC Bicep, structured logging, `/health` endpoint, async job pattern |
| **Performance** | Parallel agent execution (asyncio), two-level Redis cache, SonarCloud pre-fetch, MCP enrichment optional |
