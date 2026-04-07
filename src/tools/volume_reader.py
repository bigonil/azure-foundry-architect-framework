"""
volume_reader.py — read artifact files from a local directory mounted into the container.

Mount point (Docker): /app/uploads
Layout convention:
  /app/uploads/<session_or_project>/code/   ← application source files
  /app/uploads/<session_or_project>/iac/    ← infrastructure-as-code files

  OR flat layout (folder path passed directly):
  /app/uploads/<any_path>/

Public API
----------
  read_volume_artifacts(path, allowed_exts) -> list[ArtifactItem]
  list_volume_tree(path)                    -> list[str]  (relative paths)
"""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Root mount point inside the container (matches compose.yml volume target)
VOLUME_ROOT = Path("/app/uploads")

# Directories to skip when walking the tree
_SKIP_DIRS = frozenset({
    "node_modules", ".git", ".venv", "__pycache__",
    "dist", "build", ".next", "vendor", "target", ".terraform",
})

# Default allowed extensions for code artifacts
CODE_EXTS: frozenset[str] = frozenset({
    "py", "js", "ts", "tsx", "jsx", "java", "cs", "go", "rb", "php",
    "cpp", "c", "h", "rs", "kt", "swift", "scala", "sh", "bash", "zsh",
    "ps1", "sql", "r", "lua", "dart", "ex", "exs", "clj", "hs", "ml",
    "fs", "html", "css", "scss", "sass", "less", "vue", "svelte",
    "json", "yaml", "yml", "toml", "ini", "env", "md", "txt", "xml",
    "csv", "graphql", "proto", "conf", "cfg",
})

# Default allowed extensions for IaC artifacts
IAC_EXTS: frozenset[str] = frozenset({
    "tf", "tfvars", "bicep", "json", "yaml", "yml", "toml", "env",
    "ini", "conf", "sh", "bash", "ps1", "dockerfile", "containerfile",
    "hcl", "xml", "properties",
})

# Max file size to read (5 MB); larger files are skipped
_MAX_FILE_BYTES = 5 * 1024 * 1024


def _resolve_path(user_path: str) -> Path:
    """
    Resolve a user-supplied relative path inside VOLUME_ROOT.
    Raises ValueError if the resolved path escapes the volume root (path traversal guard).
    """
    resolved = (VOLUME_ROOT / user_path.lstrip("/")).resolve()
    if not str(resolved).startswith(str(VOLUME_ROOT.resolve())):
        raise ValueError(f"Path '{user_path}' escapes the volume root — rejected.")
    return resolved


def _should_skip(path: Path) -> bool:
    return any(part in _SKIP_DIRS for part in path.parts)


def list_volume_tree(folder_path: str = "") -> list[str]:
    """
    Return relative paths of all files inside *folder_path* (relative to VOLUME_ROOT).
    Skips noise directories.
    """
    root = _resolve_path(folder_path)
    if not root.exists():
        logger.warning("Volume path does not exist: %s", root)
        return []

    results: list[str] = []
    for f in root.rglob("*"):
        if f.is_file() and not _should_skip(f.relative_to(VOLUME_ROOT)):
            results.append(str(f.relative_to(root)))
    return sorted(results)


def read_volume_artifacts(
    folder_path: str,
    allowed_exts: frozenset[str] | None = None,
) -> list[dict[str, str]]:
    """
    Walk *folder_path* (relative to VOLUME_ROOT) and return a list of
    ``{"filename": <relative_path>, "content": <text>}`` dicts, one per file.

    Files larger than 5 MB or with disallowed extensions are skipped.
    Binary files that cannot be decoded as UTF-8 are skipped with a warning.

    Parameters
    ----------
    folder_path:
        Path relative to /app/uploads (e.g. "myproject/code").
    allowed_exts:
        Set of lowercase extensions to include (without leading dot).
        Pass ``None`` to accept all text files (extension-agnostic).
    """
    root = _resolve_path(folder_path)
    if not root.exists():
        raise FileNotFoundError(f"Volume path not found: {root}")

    artifacts: list[dict[str, str]] = []
    skipped_binary = 0
    skipped_ext = 0
    skipped_size = 0

    for file_path in sorted(root.rglob("*")):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(root)
        if _should_skip(rel):
            continue

        ext = file_path.suffix.lstrip(".").lower()
        if allowed_exts is not None and ext not in allowed_exts:
            skipped_ext += 1
            continue

        if file_path.stat().st_size > _MAX_FILE_BYTES:
            logger.warning("Skipping large file (>5 MB): %s", rel)
            skipped_size += 1
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="strict")
        except (UnicodeDecodeError, ValueError):
            logger.debug("Skipping binary file: %s", rel)
            skipped_binary += 1
            continue

        artifacts.append({"filename": str(rel), "content": content})

    logger.info(
        "Volume scan '%s': %d artifacts loaded, %d ext-skipped, %d binary-skipped, %d size-skipped",
        folder_path, len(artifacts), skipped_ext, skipped_binary, skipped_size,
    )
    return artifacts
