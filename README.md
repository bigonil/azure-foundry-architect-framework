# Efesto — AI Fabryc

Multi-agent AI system for cloud architecture analysis, migration planning, cost optimization,
and Well-Architected Framework review. Built on **Azure AI Foundry**, following Microsoft **CAF**
and **WAF** best practices.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User / Frontend                          │
│                   React SPA (Vite + Tailwind)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API
┌────────────────────────────▼────────────────────────────────────┐
│                      FastAPI Backend                            │
│                 /api/analysis/start  /quick-scan                │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   Orchestrator Agent                            │
│          Plans execution, coordinates specialists               │
└──┬──────────────────┬──────────────────┬────────────────────────┘
   │ Phase 1          │ Phase 1          │ Phase 2 (parallel)
   ▼                  ▼                  ▼
┌──────────┐    ┌──────────┐    ┌────────────────────────────────┐
│   Code   │    │  Infra   │    │  Cost  │ Migration │ GAP │ WAF │
│ Analyzer │    │ Analyzer │    │  Opt.  │  Planner  │     │ Rev │
└──────────┘    └──────────┘    └────────────────────────────────┘
   │                  │                  │
   └──────────────────┴──────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                  Azure AI Foundry                               │
│  GPT-4o Models │ AI Search (CAF/WAF KB) │ Agent Service        │
└─────────────────────────────────────────────────────────────────┘
```

## Specialist Agents

| Agent | Role | Key Outputs |
|-------|------|-------------|
| `code_analyzer` | Application code analysis | Language/framework inventory, cloud coupling score, tech debt |
| `infra_analyzer` | IaC analysis | Resource inventory, service mapping, security posture |
| `cost_optimizer` | FinOps analysis | Savings opportunities, reserved instance ROI, right-sizing |
| `migration_planner` | CAF migration planning | 6Rs strategy, wave plan, risk register |
| `gap_analyzer` | GAP analysis | Current vs target gaps across 7 dimensions |
| `waf_reviewer` | WAF review | 5-pillar scoring with prioritized recommendations |

## Supported Use Cases

- **AWS → Azure migration**: EC2, RDS, S3, Lambda, EKS → full Azure service mapping
- **GCP → Azure migration**: GKE, Cloud SQL, Pub/Sub → Azure equivalents
- **On-premises modernization**: Lift-and-shift vs re-architect decision support
- **Cost optimization**: Right-size existing Azure workloads without migration
- **WAF assessment**: Score your architecture and prioritize improvements
- **App modernization**: Monolith to microservices / serverless refactoring guidance

## Project Structure

```
azure-foundry-architect-framework/
├── infra/                    # Azure Bicep infrastructure
│   ├── main.bicep            # Root deployment (subscription scope)
│   ├── modules/
│   │   ├── ai-foundry.bicep  # AI Hub + Project + connections
│   │   ├── openai.bicep      # GPT-4o + GPT-4o-mini deployments
│   │   ├── ai-search.bicep   # Knowledge base (CAF/WAF/patterns)
│   │   ├── cosmosdb.bicep    # Session & report storage
│   │   ├── container-apps.bicep  # API hosting (auto-scale)
│   │   ├── keyvault.bicep    # Secrets management
│   │   ├── monitoring.bicep  # Log Analytics + App Insights
│   │   └── networking.bicep  # VNet, NSGs, subnets
│   └── parameters/
│       ├── dev.bicepparam
│       └── prod.bicepparam
├── src/
│   ├── agents/               # Python agent implementations
│   │   ├── base_agent.py     # Abstract base (Foundry + Direct modes)
│   │   ├── orchestrator.py   # Master coordinator
│   │   ├── code_analyzer.py
│   │   ├── infra_analyzer.py
│   │   ├── cost_optimizer.py
│   │   ├── migration_planner.py
│   │   ├── gap_analyzer.py
│   │   └── waf_reviewer.py
│   ├── tools/                # Agent support tools
│   │   ├── code_scanner.py   # Language/framework/SDK detection
│   │   ├── infra_parser.py   # Terraform/Bicep/K8s parsing
│   │   └── pricing_calculator.py  # Azure Pricing API client
│   ├── api/                  # FastAPI application
│   │   ├── main.py
│   │   ├── routes/analysis.py
│   │   └── models/
│   └── config/
│       ├── settings.py       # Pydantic Settings
│       └── prompts/          # YAML system prompts per agent
├── client/                   # React + Vite + Tailwind frontend
│   └── src/
│       ├── pages/            # HomePage, AnalysisPage, ReportPage, HistoryPage
│       ├── components/
│       └── services/api.ts
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.client
│   └── nginx.conf
├── scripts/
│   ├── deploy.sh             # Full Azure deployment
│   └── setup-rbac.sh         # RBAC assignments (Managed Identity)
├── compose.yml               # Local development
└── pyproject.toml
```

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker Desktop
- Azure subscription with AI Foundry access

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Azure resource endpoints
```

### 2. Start with Docker Compose

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000
- Docs: http://localhost:8000/docs

### 3. Or run locally (dev mode)

```bash
# Backend
pip install -e ".[dev]"
uvicorn src.api.main:app --reload --port 8000

# Frontend (new terminal)
cd client && npm install && npm run dev
```

## Deploy to Azure

```bash
# 1. Login
az login

# 2. Deploy infrastructure + app
./scripts/deploy.sh dev         # or staging / prod

# 3. Assign RBAC (Managed Identity — no passwords)
./scripts/setup-rbac.sh dev
```

## Agent Execution Modes

| Mode | When to use | Pros | Cons |
|------|-------------|------|------|
| **Direct** (`use_foundry_mode=false`) | Dev, small projects, low latency | Fast, simple | No persistence |
| **Foundry** (`use_foundry_mode=true`) | Production, large projects | Full persistence, threading, tools | Slightly slower |

## Architecture Decisions (ADRs)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Backend | Azure OpenAI GPT-4o | Best reasoning for architecture analysis; CAF/WAF alignment |
| Agent Framework | Azure AI Agent Service + Semantic Kernel | Native Foundry integration; tool use; file search |
| Knowledge Base | Azure AI Search (semantic) | RAG over CAF/WAF docs; enables up-to-date guidance |
| State Store | MongoDB 7 (Container App + Azure Files) | Open-source, portable, schemaless; no PaaS license fee |
| API | FastAPI + async | Native asyncio for parallel agent execution |
| Auth | Managed Identity (RBAC) | Zero secrets; WAF Security pillar compliant |
| Hosting | Azure Container Apps | Auto-scale to 0; cost-efficient; managed TLS |

## WAF Compliance Summary

| Pillar | Implementation |
|--------|---------------|
| **Reliability** | Health probes, AZ redundancy (prod), Cosmos backup, retry logic in agents |
| **Security** | Managed Identity, Key Vault, Private Endpoints (prod), no local auth |
| **Cost Optimization** | Serverless Cosmos, Container Apps scale-to-0, GPT-4o-mini for lightweight tasks |
| **Operational Excellence** | IaC (Bicep), CI/CD-ready, Log Analytics, App Insights, structured logging |
| **Performance** | Parallel agent execution (asyncio), Azure AI Search semantic ranking |
