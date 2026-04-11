# Efesto AI Fabryc — Analisi Miglioramenti Storage & Upload

**Data:** 2026-04-07  
**Branch:** `01_03_02`  
**Autore:** Architettura — sessione Claude Code

---

## Contesto: il collo di bottiglia attuale

Il pattern di upload corrente è:

```
Frontend
  → legge file come testo (File.text())
  → serializza in JSON body
  → POST /api/analysis/start  (payload potenzialmente multi-MB)
Backend
  → deserializza JSON
  → passa file content agli agenti come stringhe in memoria
```

Questo causa:
- **422 Unprocessable Entity** con cartelle grandi (file binari, >500 file, payload troppo grande)
- **Pressione di memoria** sul backend (tutti i file in RAM durante l'analisi)
- **Nessuna persistenza** degli artifact dopo l'analisi
- **Nessuna deduplication**: stesso file in due analisi → doppio storage su MongoDB

---

## Opzione A — MinIO (Object Storage S3-compatible)

### Descrizione

MinIO è un object storage open source, S3 e Azure Blob Storage-compatible. Sostituisce il pattern JSON-with-content con un flusso presigned URL:

```
Frontend
  → POST /api/artifacts/upload-url  { filename, size }
  ← { presigned_put_url, artifact_key }
  → PUT presigned_put_url  (upload diretto su MinIO, bypass backend)
  → POST /api/analysis/start  { artifact_keys: [...] }  ← solo chiavi, nessun content

Backend
  → legge artifact da MinIO in streaming
  → passa agli agenti
  → salva report su MinIO (futuro: export Word/PDF)
```

### Integrazione Docker

```yaml
# compose.local.yml — aggiunta MinIO
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"   # API S3
      - "9001:9001"   # Console web
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-efesto}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-changeme_local}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  minio_data:
```

### Parity locale → produzione Azure

| Locale (MinIO) | Produzione (Azure) |
|---|---|
| `minio/minio:latest` su Docker | Azure Blob Storage |
| Endpoint: `http://localhost:9000` | Endpoint: `https://<account>.blob.core.windows.net` |
| SDK: `boto3` / `azure-storage-blob` | SDK: `azure-storage-blob` |
| Credenziali: access key/secret | Credenziali: Managed Identity / connection string |

La migrazione richiede solo la sostituzione dell'endpoint e delle credenziali. Il codice Python resta invariato se si usa `azure-storage-blob` con URL custom o `boto3` con endpoint override.

### Vantaggi

- Elimina completamente i payload JSON enormi
- File deduplication (hash-based key → stesso file, un solo oggetto)
- I report generati (Word, PDF) possono essere salvati su MinIO e serviti via presigned GET URL
- Console web integrata (porta 9001) per ispezione manuale degli artifact
- Production parity perfetta con Azure Blob Storage

### Svantaggi

- Aggiunge un servizio Docker e una dipendenza SDK
- Il flusso frontend diventa a due fasi (presigned URL + POST analisi)
- Richiede gestione bucket, policy, lifecycle rules

### Effort stimato

| Task | Effort |
|---|---|
| Docker service + bucket init | 1h |
| Backend: endpoint presigned URL + lettura streaming | 3h |
| Frontend: upload diretto su presigned URL | 2h |
| Aggiornamento AnalysisRequest (keys invece di content) | 2h |
| Test end-to-end | 2h |
| **Totale** | **~1 giornata** |

---

## Opzione B — Git Clone Server-side

### Descrizione

La UI ha già i tab **GitHub** e **Azure DevOps** ma il backend simula tutto con dati mock. L'implementazione reale fa clonare il repository direttamente al backend:

```
Frontend
  → POST /api/analysis/start {
      repo_url, branch, token,
      code_folder: "src/",
      iac_folder: "infra/"
    }

Backend
  → git clone --depth 1 --branch <branch> <repo_url>  (shallow clone)
  → legge i file dalle cartelle specificate
  → esegue analisi
  → rm -rf clone temporaneo
```

### Implementazione backend (sketch)

```python
# src/tools/git_importer.py
import asyncio
import tempfile
import shutil
from pathlib import Path

async def clone_and_read(
    repo_url: str,
    branch: str,
    token: str | None,
    code_folder: str = "",
    iac_folder: str = "",
) -> tuple[list[ArtifactItem], list[ArtifactItem]]:
    authenticated_url = _inject_token(repo_url, token)
    with tempfile.TemporaryDirectory() as tmp:
        await asyncio.create_subprocess_exec(
            "git", "clone", "--depth", "1", "--branch", branch,
            authenticated_url, tmp,
        )
        code_artifacts = _read_folder(Path(tmp) / code_folder, CODE_EXTS)
        iac_artifacts  = _read_folder(Path(tmp) / iac_folder,  IAC_EXTS)
    return code_artifacts, iac_artifacts
```

### Vantaggi

- Nessun upload, nessuno storage aggiuntivo
- Lavora su repository reali con storia Git
- Pattern naturale per un tool di architecture review
- I tab GitHub/DevOps nella UI diventano funzionali
- Shallow clone (`--depth 1`) → solo l'ultimo commit, veloce

### Svantaggi

- Richiede che il backend abbia accesso di rete al repository
- Gestione sicura dei token (non loggare mai il token)
- Clone temporaneo su filesystem del container → pulizia obbligatoria
- Non funziona per codice non versionato (es. export da IDE)

### Effort stimato

| Task | Effort |
|---|---|
| `git_importer.py` con clone asincrono + lettura | 2h |
| Aggiornamento `AnalysisRequestBody` (modalità repo) | 1h |
| Backend route `/start` con branch repo/upload | 1h |
| Frontend: attivare tab GitHub/DevOps con chiamata reale | 2h |
| Gestione errori (auth fail, repo privato, branch inesistente) | 1h |
| **Totale** | **~mezza giornata** |

---

## Opzione C — Volume Docker Montato

### Descrizione

Il container API monta una directory locale. Il frontend invia solo i path relativi, il backend legge direttamente dal filesystem.

```yaml
# compose.yml
  api:
    volumes:
      - ./src:/app/src:ro
      - ~/efesto-uploads:/app/uploads   # <-- nuovo
```

```python
# Backend legge da filesystem invece di ricevere content
artifacts = read_directory("/app/uploads/code/")
```

### Vantaggi

- Zero overhead di upload
- Implementazione triviale (30 minuti)
- Ottimo per sviluppo locale e CI/CD pipeline interne

### Svantaggi

- Rompe il concetto di web UI: l'utente deve avere accesso diretto alla macchina che esegue Docker
- Non scalabile in produzione (Azure Container Apps non monta volumi locali arbitrari)
- Non utilizzabile da utenti remoti

---

## Confronto riepilogativo

| Criterio | MinIO | Git Clone | Volume |
|---|---|---|---|
| Risolve il 422/payload | ✅ Completamente | ✅ Completamente | ✅ Completamente |
| Production parity | ✅ Azure Blob Storage | ✅ GitHub/DevOps già in uso | ❌ Solo locale |
| Scalabilità | ✅ Alta | ✅ Alta | ❌ Solo locale |
| Persiste gli artifact | ✅ Sì | ❌ Clone temporaneo | ❌ Dipende da mount |
| UX web | ✅ Trasparente per utente | ✅ Più semplice (solo URL) | ❌ Richiede accesso macchina |
| Effort | ~1 giornata | ~mezza giornata | 30 min |
| Dependency aggiunta | MinIO container | `git` nel container API | Nessuna |

---

## Raccomandazione

### Priorità suggerita

```
1. MinIO          → risolve il problema root + production parity con Azure Blob
2. Git Clone      → attiva feature già presenti nella UI + use case principale
3. Volume mount   → solo per ambienti CI/CD interni, non per la web UI
```

### Roadmap implementativa

```
Sprint 1 (1 giorno)
  └─ MinIO: Docker service + presigned URL flow + SDK backend

Sprint 2 (mezza giornata)
  └─ Git Clone: git_importer.py + attivazione tab GitHub/DevOps

Backlog
  └─ Volume mount come opzione per CI/CD pipeline
```

### Nota sulla scelta MinIO vs Git Clone first

Se il caso d'uso principale è **analisi di codice che esiste già su GitHub o Azure DevOps**, il Git Clone è più veloce da implementare e più naturale per l'utente (inserisce una URL invece di caricare file). MinIO diventa più rilevante quando si vuole analizzare codice **non versionato** (export da IDE, snapshot locali) o quando si vogliono **persistere i report generati** (Word, PDF, diagrammi architetturali).

---

*Documento generato durante sessione di analisi architetturale — Efesto AI Fabryc `01_03_02`*
