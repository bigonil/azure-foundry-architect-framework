"""
git_importer.py — server-side shallow Git clone for GitHub and Azure DevOps.

Clones a repository into a temporary directory, reads the requested
code/IaC folders, and returns ArtifactItem-compatible dicts.
The temporary directory is always cleaned up after reading.

Public API
----------
  clone_github(repo_url, branch, token, code_folder, iac_folder)
      -> tuple[list[dict], list[dict]]   (code_artifacts, iac_artifacts)

  clone_devops(org_url, project, repo, branch, token, code_folder, iac_folder)
      -> tuple[list[dict], list[dict]]

Both functions are async and safe to call from FastAPI background tasks
or route handlers via ``await``.
"""
from __future__ import annotations

import asyncio
import logging
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

# Extensions treated as code / IaC (mirrors frontend filters)
_CODE_EXTS: frozenset[str] = frozenset({
    "py", "js", "ts", "tsx", "jsx", "java", "cs", "go", "rb", "php",
    "cpp", "c", "h", "rs", "kt", "swift", "scala", "sh", "bash", "zsh",
    "ps1", "sql", "r", "lua", "dart", "ex", "exs", "clj", "hs", "ml",
    "fs", "html", "css", "scss", "sass", "less", "vue", "svelte",
    "json", "yaml", "yml", "toml", "ini", "env", "md", "txt", "xml",
    "csv", "graphql", "proto", "conf", "cfg",
})

_IAC_EXTS: frozenset[str] = frozenset({
    "tf", "tfvars", "bicep", "json", "yaml", "yml", "toml", "env",
    "ini", "conf", "sh", "bash", "ps1", "dockerfile", "containerfile",
    "hcl", "xml", "properties",
})

_SKIP_DIRS: frozenset[str] = frozenset({
    "node_modules", ".git", ".venv", "__pycache__",
    "dist", "build", ".next", "vendor", "target", ".terraform",
})

_MAX_FILE_BYTES = 5 * 1024 * 1024   # 5 MB per file
_CLONE_TIMEOUT  = 120                # seconds


# ── Internal helpers ──────────────────────────────────────────────────────────

def _inject_token_github(repo_url: str, token: str) -> str:
    """Embed a PAT/classic token into a GitHub HTTPS URL."""
    parsed = urlparse(repo_url)
    authed = parsed._replace(netloc=f"{token}@{parsed.hostname}")
    return urlunparse(authed)


def _inject_token_devops(org_url: str, token: str) -> str:
    """Embed a PAT into an Azure DevOps HTTPS URL (Basic auth pattern)."""
    parsed = urlparse(org_url)
    # Azure DevOps accepts 'anything:PAT' as Basic credentials
    authed = parsed._replace(netloc=f"pat:{token}@{parsed.hostname}")
    return urlunparse(authed)


def _build_devops_clone_url(org_url: str, project: str, repo: str, token: str) -> str:
    """
    Build the clone URL for an Azure DevOps repository.
    Format: https://pat:<token>@dev.azure.com/<org>/<project>/_git/<repo>
    """
    parsed = urlparse(org_url.rstrip("/"))
    org = parsed.path.lstrip("/").split("/")[0] if parsed.path.strip("/") else parsed.hostname
    base = f"https://dev.azure.com/{org}/{project}/_git/{repo}"
    if token:
        base = _inject_token_devops(base, token)
    return base


async def _run_git(*args: str, cwd: str | None = None) -> None:
    """Run a git sub-command asynchronously; raises RuntimeError on failure."""
    cmd = ["git", *args]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=_CLONE_TIMEOUT)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"git {args[0]} timed out after {_CLONE_TIMEOUT}s")

    if proc.returncode != 0:
        # Redact tokens from error messages before logging
        err_text = re.sub(r"https?://[^@]+@", "https://<redacted>@", stderr.decode())
        raise RuntimeError(f"git {args[0]} failed (exit {proc.returncode}): {err_text.strip()}")


def _read_folder(root: Path, sub_folder: str, allowed_exts: frozenset[str]) -> list[dict[str, str]]:
    """
    Walk *sub_folder* inside *root* and return ArtifactItem-compatible dicts.
    Skips binary files, large files, and noise directories.
    """
    target = (root / sub_folder.lstrip("/")) if sub_folder else root
    if not target.exists():
        logger.warning("Folder not found in clone: %s", target)
        return []

    artifacts: list[dict[str, str]] = []
    skipped = 0

    for fp in sorted(target.rglob("*")):
        if not fp.is_file():
            continue
        rel = fp.relative_to(target)
        if any(part in _SKIP_DIRS for part in rel.parts):
            continue
        ext = fp.suffix.lstrip(".").lower()
        if ext not in allowed_exts:
            continue
        if fp.stat().st_size > _MAX_FILE_BYTES:
            logger.warning("Skipping large file: %s", rel)
            skipped += 1
            continue
        try:
            content = fp.read_text(encoding="utf-8", errors="strict")
        except (UnicodeDecodeError, ValueError):
            skipped += 1
            continue
        artifacts.append({"filename": str(rel), "content": content})

    logger.info("Read %d artifacts from '%s' (%d skipped)", len(artifacts), sub_folder or ".", skipped)
    return artifacts


async def _clone_and_read(
    clone_url: str,
    branch: str,
    code_folder: str,
    iac_folder: str,
) -> tuple[list[dict], list[dict]]:
    """
    Shallow-clone *clone_url* at *branch* into a temp dir, read code and IaC
    folders, then delete the temp dir.
    """
    tmp = tempfile.mkdtemp(prefix="efesto_clone_")
    try:
        logger.info("Cloning branch '%s' into %s", branch, tmp)
        await _run_git(
            "clone", "--depth", "1", "--branch", branch,
            "--single-branch", clone_url, tmp,
        )
        root = Path(tmp)
        code_artifacts = _read_folder(root, code_folder, _CODE_EXTS)
        iac_artifacts  = _read_folder(root, iac_folder,  _IAC_EXTS)
        return code_artifacts, iac_artifacts
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        logger.info("Cleaned up temp clone at %s", tmp)


# ── Public API ────────────────────────────────────────────────────────────────

async def clone_github(
    repo_url: str,
    branch: str = "main",
    token: str | None = None,
    code_folder: str = "",
    iac_folder: str = "",
) -> tuple[list[dict], list[dict]]:
    """
    Clone a GitHub repository and return (code_artifacts, iac_artifacts).

    Parameters
    ----------
    repo_url    : HTTPS URL, e.g. https://github.com/org/repo
    branch      : branch name (default: main)
    token       : GitHub PAT or fine-grained token (optional for public repos)
    code_folder : sub-directory inside the repo to scan for code files
    iac_folder  : sub-directory inside the repo to scan for IaC files
    """
    clone_url = _inject_token_github(repo_url, token) if token else repo_url
    return await _clone_and_read(clone_url, branch, code_folder, iac_folder)


async def clone_devops(
    org_url: str,
    project: str,
    repo: str,
    branch: str = "main",
    token: str | None = None,
    code_folder: str = "",
    iac_folder: str = "",
) -> tuple[list[dict], list[dict]]:
    """
    Clone an Azure DevOps repository and return (code_artifacts, iac_artifacts).

    Parameters
    ----------
    org_url     : Organization URL, e.g. https://dev.azure.com/myorg
    project     : DevOps project name
    repo        : Repository name
    branch      : Branch name (default: main)
    token       : Azure DevOps Personal Access Token (PAT)
    code_folder : Sub-directory inside the repo to scan for code files
    iac_folder  : Sub-directory inside the repo to scan for IaC files
    """
    clone_url = _build_devops_clone_url(org_url, project, repo, token or "")
    return await _clone_and_read(clone_url, branch, code_folder, iac_folder)
