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
| `migration_planner` | ⏳ Soon | CAF migration | 6Rs strategy, wave plan, risk register |
| `gap_analyzer` | ⏳ Soon | GAP analysis | Current vs target across 7 dimensions |
| `waf_reviewer` | ⏳ Soon | WAF review | 5-pillar scoring with recommendations |
| `quality_analyzer` | ⏳ Soon | Quality gate | SonarQube-level code & IaC analysis |

---

## Project Structure

```
azure-foundry-architect-framework/
├── src/
│   ├── agents/
│   │   ├── base_agent.py          # Abstract base (Anthropic + Azure + Foundry)
│   │   ├── orchestrator.py        # Master coordinator + per-agent Redis cache
│   │   ├── code_analyzer.py       # + SonarCloud enrichment
│   │   ├── infra_analyzer.py
│   │   ├── cost_optimizer.py
│   │   ├── migration_planner.py
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
│   │   │   └── artifacts.py       # /presign  /delete  (object storage)
│   │   └── models/
│   │       ├── requests.py        # AnalysisRequestBody + SourceConfig union
│   │       └── responses.py
│   └── config/
│       ├── settings.py            # Pydantic Settings (all env vars)
│       └── prompts/               # YAML system prompts per agent
├── client/                        # React + Vite + Tailwind SPA
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── AnalysisPage.tsx   # 5 artifact source tabs
│       │   └── ReportPage.tsx
│       └── services/api.ts
├── infra/                         # Azure Bicep (production IaC)
│   ├── main.bicep
│   ├── modules/
│   │   ├── container-apps.bicep
│   │   ├── container-apps-env.bicep
│   │   ├── cosmosdb.bicep
│   │   ├── networking.bicep
│   │   ├── keyvault.bicep
│   │   ├── ai-foundry.bicep
│   │   ├── openai.bicep
│   │   ├── ai-search.bicep
│   │   └── monitoring.bicep
│   └── parameters/
│       ├── dev.bicepparam
│       └── prod.bicepparam
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.client
│   └── nginx.conf
├── scripts/
│   └── setup-rbac.sh             # RBAC role assignments post-deploy
├── compose.local.yml              # MongoDB + Redis + MinIO (local dev)
├── compose.yml                    # Full stack (production-like Docker)
├── pyproject.toml
├── .env.example
└── .env                           # Local secrets (never commit)
```

---

## Artifact Source Options

The **3. Artifact Source** section of the analysis form supports 5 modes:

| Tab | How it works | Best for |
|---|---|---|
| **File Upload** | Drag & drop files (browser → JSON body) | Quick tests, small projects |
| **Object Storage** | Presigned PUT → MinIO/Azure Blob (browser → storage direct) | Large files, production parity |
| **Local Volume** | Backend reads `/app/uploads` at analysis start | CI/CD pipelines, no upload |
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
| Anthropic API key | — | [console.anthropic.com](https://console.anthropic.com) |
| SonarCloud token | — | optional, but recommended |

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

Apri `.env` e compila almeno le variabili obbligatorie:

```env
# ── LLM (obbligatorio) ────────────────────────────────────────────
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...          # https://console.anthropic.com → API Keys
ANTHROPIC_MODEL=claude-opus-4-6

# ── MongoDB ───────────────────────────────────────────────────────
MONGO_ROOT_PASSWORD=changeme_local
MONGODB_URI=mongodb://admin:changeme_local@localhost:27017/efesto-fabryc?authSource=admin
MONGODB_DATABASE=efesto-fabryc

# ── Redis ─────────────────────────────────────────────────────────
REDIS_URI=redis://localhost:6379/0

# ── SonarCloud (opzionale) ────────────────────────────────────────
SONARCLOUD_TOKEN=                     # sonarcloud.io → My Account → Security
SONARCLOUD_ORG=bigonil

# ── Agenti ────────────────────────────────────────────────────────
AGENT_TIMEOUT_SECONDS=300
AGENT_MAX_TOKENS=4096
AGENT_TEMPERATURE=0.1

# ── App ───────────────────────────────────────────────────────────
APP_ENV=development
APP_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Step 3 — Avviare i servizi Docker (MongoDB + Redis + MinIO)

```bash
docker compose -f compose.local.yml up -d
```

Verifica che tutti i servizi siano **healthy**:

```bash
docker compose -f compose.local.yml ps
```

Output atteso:

```
NAME                              STATUS
efesto-fabryc-local-mongodb-1     Up (healthy)
efesto-fabryc-local-redis-1       Up (healthy)
efesto-fabryc-local-minio-1       Up (healthy)
```

> **MinIO** è opzionale per la modalità base. Se non vuoi usarlo, puoi ignorare il container.
> Per attivarlo, aggiungi al `.env`:
> ```env
> STORAGE_BACKEND=minio
> MINIO_ENDPOINT=http://localhost:9005
> MINIO_PUBLIC_ENDPOINT=http://localhost:9005
> MINIO_ACCESS_KEY=efesto
> MINIO_SECRET_KEY=changeme_local_minio
> MINIO_BUCKET=efesto-artifacts
> ```

---

## Step 4 — Installare le dipendenze Python e avviare il backend

```bash
# Crea e attiva il virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Installa le dipendenze
pip install -e .

# Avvia il backend (hot reload)
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

Verifica: apri [http://localhost:8000/health](http://localhost:8000/health)

```json
{ "status": "healthy", "version": "1.0.0" }
```

Documentazione API interattiva: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Step 5 — Avviare il frontend

Apri un nuovo terminale (mantieni il backend attivo):

```bash
cd client
npm install
npm run dev
```

Apri [http://localhost:5173](http://localhost:5173)

---

## Step 6 — Usare l'applicazione

1. **Home** → clicca **Start Analysis**
2. **Step 1** — inserisci il nome del progetto e seleziona il cloud sorgente
3. **Step 2** — seleziona gli agenti (in MVP mode sono attivi solo *Code Analyzer* e *Infra Analyzer*)
4. **Step 3 — Artifact Source** — scegli come fornire il codice:

   | Scenario | Tab da usare |
   |---|---|
   | Hai i file sul PC | **File Upload** → drag & drop o "Add Folder" |
   | Vuoi usare MinIO | **Object Storage** → seleziona i file, vengono caricati direttamente su MinIO |
   | Hai il codice in una cartella montata su Docker | **Local Volume** → specifica i path relativi a `/app/uploads` |
   | Codice su GitHub | **GitHub** → URL repo + branch + PAT (opzionale per repo pubblici) |
   | Codice su Azure DevOps | **Azure DevOps** → Org URL + Project + Repo + PAT (scope: Code read) |

5. Clicca **Start Analysis** — il backend elabora in background
6. La pagina report aggiorna automaticamente lo stato finché l'analisi non è completata

---

## MinIO — Console Web

Quando MinIO è in esecuzione, la console è disponibile su:

```
http://localhost:9006
Username: efesto
Password: changeme_local_minio   (o il valore di MINIO_SECRET_KEY nel .env)
```

Il bucket `efesto-artifacts` viene creato automaticamente dal backend al primo utilizzo.

---

## Usare il volume locale (/app/uploads)

Per analizzare codice senza upload, copia i file nella cartella locale che Docker monta come volume:

```bash
# Il volume efesto_uploads è gestito da Docker
# Per trovare il path fisico sul tuo PC:
docker volume inspect efesto-fabryc-local_efesto_uploads

# Oppure copia direttamente nel container in esecuzione
docker cp ./mio-progetto/src efesto-fabryc-local-api-1:/app/uploads/mio-progetto/code
docker cp ./mio-progetto/infra efesto-fabryc-local-api-1:/app/uploads/mio-progetto/iac
```

Poi nella form → tab **Local Volume**:
- Code folder: `mio-progetto/code`
- IaC folder: `mio-progetto/iac`

---

# Azure Deployment — Step by Step

## Prerequisiti Azure

- Azure CLI installata e autenticata: `az login`
- Subscription con quota per Azure OpenAI GPT-4o
- Azure AI Foundry Hub (opzionale, per `use_foundry_mode=true`)
- Azure Container Registry (ACR) per le immagini Docker
- SonarCloud account (opzionale)

---

## Step 1 — Login e selezione subscription

```bash
az login
az account set --subscription "<subscription-id>"

# Verifica la subscription attiva
az account show --query "{name:name, id:id}" -o table
```

---

## Step 2 — Deploy dell'infrastruttura con Bicep

```bash
# Deploy per ambiente dev
az deployment sub create \
  --name "efesto-dev-$(date +%Y%m%d)" \
  --location westeurope \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam \
  --parameters prefix=afaf environmentName=dev

# Verifica il resource group creato
az group show --name rg-afaf-dev --query "{name:name, location:location}" -o table
```

Le risorse create dal Bicep:

| Risorsa | Nome (pattern) | Scopo |
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

## Step 3 — Build e push delle immagini Docker

```bash
# Ottieni il nome dell'ACR dal deploy
ACR_NAME=$(az acr list --resource-group rg-afaf-dev --query "[0].name" -o tsv)

# Login all'ACR
az acr login --name $ACR_NAME

# Build e push backend
docker build -t $ACR_NAME.azurecr.io/efesto-api:latest -f docker/Dockerfile.api .
docker push $ACR_NAME.azurecr.io/efesto-api:latest

# Build e push frontend
docker build -t $ACR_NAME.azurecr.io/efesto-client:latest -f docker/Dockerfile.client .
docker push $ACR_NAME.azurecr.io/efesto-client:latest
```

---

## Step 4 — Assegnare i ruoli RBAC (Managed Identity)

```bash
# Assegna i ruoli minimi necessari all'identità della Container App
chmod +x scripts/setup-rbac.sh
./scripts/setup-rbac.sh dev
```

Lo script assegna:
- `Cognitive Services OpenAI User` → Container App può chiamare Azure OpenAI
- `Search Index Data Reader` → Container App può leggere gli indici AI Search
- `Key Vault Secrets User` → Container App può leggere i secret da Key Vault

---

## Step 5 — Configurare i secret in Key Vault

```bash
KV_NAME="kv-afaf-dev"

# Anthropic (se usi modalità anthropic anche in Azure)
az keyvault secret set --vault-name $KV_NAME \
  --name "anthropic-api-key" --value "sk-ant-..."

# SonarCloud
az keyvault secret set --vault-name $KV_NAME \
  --name "sonarcloud-token" --value "<token>"

# MongoDB (se non usi Cosmos DB API nativa)
az keyvault secret set --vault-name $KV_NAME \
  --name "mongodb-uri" --value "<connection-string>"
```

---

## Step 6 — Aggiornare le immagini sulle Container Apps

```bash
# Aggiorna il backend
az containerapp update \
  --name ca-api-afaf-dev \
  --resource-group rg-afaf-dev \
  --image $ACR_NAME.azurecr.io/efesto-api:latest \
  --set-env-vars \
    LLM_PROVIDER=azure \
    APP_ENV=production \
    STORAGE_BACKEND=azure \
    AZURE_STORAGE_ACCOUNT_NAME="<storage-account-name>" \
    AZURE_STORAGE_CONTAINER="efesto-artifacts"

# Aggiorna il frontend
az containerapp update \
  --name ca-client-afaf-dev \
  --resource-group rg-afaf-dev \
  --image $ACR_NAME.azurecr.io/efesto-client:latest
```

---

## Step 7 — Configurare Azure Blob Storage (sostituisce MinIO)

```bash
# Crea lo storage account (se non già creato dal Bicep)
az storage account create \
  --name "stafaf${ENV}" \
  --resource-group rg-afaf-dev \
  --location westeurope \
  --sku Standard_LRS \
  --allow-blob-public-access false

# Assegna Storage Blob Data Contributor alla Container App
STORAGE_ID=$(az storage account show \
  --name "stafafdev" -g rg-afaf-dev --query "id" -o tsv)

az role assignment create \
  --assignee $CA_PRINCIPAL \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID
```

Con Managed Identity attiva, il backend non ha bisogno di connection string:
```env
STORAGE_BACKEND=azure
AZURE_STORAGE_ACCOUNT_NAME=stafafdev
AZURE_STORAGE_CONNECTION_STRING=   # lascia vuoto → usa Managed Identity
AZURE_STORAGE_CONTAINER=efesto-artifacts
```

---

## Step 8 — Verifica il deploy

```bash
# URL della Container App frontend
az containerapp show \
  --name ca-client-afaf-dev \
  --resource-group rg-afaf-dev \
  --query "properties.configuration.ingress.fqdn" -o tsv

# Health check backend
curl https://$(az containerapp show \
  --name ca-api-afaf-dev -g rg-afaf-dev \
  --query "properties.configuration.ingress.fqdn" -o tsv)/health
```

---

## Migrazione da locale a produzione — variabili chiave

| Variabile | Locale | Produzione |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `azure` |
| `STORAGE_BACKEND` | `minio` | `azure` |
| `MINIO_ENDPOINT` | `http://localhost:9005` | — |
| `AZURE_STORAGE_ACCOUNT_NAME` | — | `<nome account>` |
| `AZURE_STORAGE_CONNECTION_STRING` | — | vuoto → Managed Identity |
| `MONGODB_URI` | `mongodb://admin:...@localhost:27017` | Cosmos DB connection string |
| `REDIS_URI` | `redis://localhost:6379/0` | Azure Cache for Redis URI |
| `APP_ENV` | `development` | `production` |

---

# API Reference

| Method | Endpoint | Descrizione |
|---|---|---|
| `POST` | `/api/analysis/start` | Avvia analisi asincrona (controlla cache Redis prima) |
| `GET` | `/api/analysis/{id}/status` | Poll stato: `running` / `completed` / `failed` |
| `GET` | `/api/analysis/{id}` | Report completo (200 quando completato) |
| `GET` | `/api/analysis/` | Lista tutte le sessioni |
| `POST` | `/api/analysis/quick-scan` | Analisi sincrona (progetti piccoli, timeout 120s) |
| `POST` | `/api/artifacts/presign` | Presigned PUT URL per upload diretto su MinIO/Blob |
| `DELETE` | `/api/artifacts/{key}` | Elimina un artifact dallo storage |
| `GET` | `/health` | Health check |

### Source config — esempi

**File Upload (default):**
```json
{ "code_artifacts": [...], "iac_artifacts": [...] }
```

**Object Storage:**
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

Il `code_analyzer` interroga automaticamente SonarCloud prima di chiamare Claude.

**Cosa viene recuperato:**
- Quality Gate status (OK / ERROR)
- Metriche: bug, vulnerabilità, security hotspot, code smell, coverage %, duplicazione %, technical debt, LOC
- Rating: Reliability, Security, Maintainability (A–E)
- Top issue aperti (BLOCKER / CRITICAL)

**Configurazione:**
```env
SONARCLOUD_TOKEN=<user-token>   # sonarcloud.io → My Account → Security → Generate Token
SONARCLOUD_ORG=bigonil          # Organization key (visibile in Org Settings → Key)
```

Il progetto deve essere già scansionato almeno una volta via `sonar-scanner` o pipeline CI/CD.

---

# Redis Cache — Due Livelli

| Livello | Chiave cache | TTL | Effetto |
|---|---|---|---|
| **Report** | SHA-256 dell'intera request | 24h | Request identica → risposta immediata, 0 chiamate Claude |
| **Per-agent** | SHA-256 degli input specifici dell'agente | 48h | Riutilizza risultato agente su analisi diverse |

Redis degrada gracefully — se non disponibile, l'analisi prosegue normalmente senza cache.

---

# WAF Compliance

| Pillar | Implementazione |
|---|---|
| **Reliability** | Health probe, retry logic negli agenti, degradazione graceful Redis/SonarCloud |
| **Security** | Managed Identity (prod), Key Vault, Private Endpoint (prod), nessun secret nel codice |
| **Cost Optimization** | Redis cache (evita chiamate Claude ridondanti), scale-to-0 Container Apps, report in EUR |
| **Operational Excellence** | IaC Bicep, structured logging, `/health` endpoint, pattern job asincrono |
| **Performance** | Esecuzione agenti parallela (asyncio), cache Redis a due livelli, pre-fetch SonarCloud |
