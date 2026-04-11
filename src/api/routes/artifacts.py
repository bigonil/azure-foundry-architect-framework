"""
Artifact upload routes.

Endpoints
─────────
POST /api/artifacts/presign
    Generate a presigned PUT URL for direct browser → MinIO/Azure Blob upload.

POST /api/artifacts/upload-to-volume
    Save uploaded files (multipart) to the Docker volume at /app/uploads.
    Returns the saved relative paths so they can be reused via the
    "Local Volume" source tab without re-uploading.

DELETE /api/artifacts/{key}
    Delete an artifact from object storage.
"""
import logging
import uuid
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Form, HTTPException, UploadFile
from pydantic import BaseModel

from src.config.settings import get_settings
from src.tools.blob_storage import get_client
from src.tools.volume_reader import VOLUME_ROOT, _SKIP_DIRS

router = APIRouter(prefix="/api/artifacts", tags=["Artifacts"])
logger = logging.getLogger(__name__)

_settings = get_settings()


class PresignRequest(BaseModel):
    filename: str
    artifact_type: Literal["code", "iac"]


class PresignResponse(BaseModel):
    key: str
    upload_url: str
    method: Literal["PUT"] = "PUT"
    expires_in: int


@router.post("/presign", response_model=PresignResponse)
async def generate_presigned_url(body: PresignRequest) -> PresignResponse:
    """
    Generate a presigned PUT URL for direct browser-to-storage upload.

    The returned *key* must be included in source_config.artifacts when
    calling POST /api/analysis/start.
    """
    client = get_client()
    if not client.is_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Object storage is not configured. "
                "Set STORAGE_BACKEND=minio or STORAGE_BACKEND=azure and restart."
            ),
        )

    # Key layout: uploads/<artifact_type>/<uuid>/<original_filename>
    safe_filename = body.filename.replace("..", "").lstrip("/")
    key = f"uploads/{body.artifact_type}/{uuid.uuid4().hex}/{safe_filename}"

    expiry = _settings.minio_presign_expiry_seconds
    try:
        upload_url = client.generate_presigned_put_url(key, expiry_seconds=expiry)
    except Exception as exc:
        logger.error("Failed to generate presigned URL for key '%s': %s", key, exc)
        raise HTTPException(status_code=500, detail=f"Could not generate upload URL: {exc}") from exc

    return PresignResponse(key=key, upload_url=upload_url, expires_in=expiry)


class VolumeUploadResponse(BaseModel):
    saved: list[dict]   # [{ "filename": str, "path": str, "artifact_type": str, "size_bytes": int }]
    skipped: list[str]  # filenames rejected (binary, too large, etc.)
    volume_code_folder: str
    volume_iac_folder: str


_MAX_UPLOAD_BYTES = 10 * 1024 * 1024   # 10 MB per file
_TEXT_EXTS: frozenset[str] = frozenset({
    "py","js","ts","tsx","jsx","java","cs","go","rb","php","cpp","c","h","rs","kt","swift",
    "scala","sh","bash","zsh","ps1","sql","r","lua","dart","ex","exs","clj","hs","ml","fs",
    "html","css","scss","sass","less","vue","svelte","json","yaml","yml","toml","ini","env",
    "md","txt","xml","csv","graphql","proto","conf","cfg","tf","tfvars","bicep","hcl",
    "dockerfile","containerfile","properties",
})


@router.post("/upload-to-volume", response_model=VolumeUploadResponse)
async def upload_to_volume(
    files: list[UploadFile],
    artifact_type: Annotated[Literal["code", "iac"], Form()],
    subfolder: Annotated[str, Form()] = "",
) -> VolumeUploadResponse:
    """
    Save uploaded files to the Docker volume at /app/uploads.

    Layout on disk:
        /app/uploads/<subfolder>/code/<filename>   ← artifact_type=code
        /app/uploads/<subfolder>/iac/<filename>    ← artifact_type=iac

    The subfolder defaults to a UUID when blank, so each upload batch gets
    its own isolated directory. Pass an explicit name (e.g. the project name)
    to group code and IaC files of the same project together.

    Returns the relative folder paths to use directly in the "Local Volume" tab.
    """
    if not files:
        raise HTTPException(status_code=422, detail="No files provided.")

    # Resolve destination directory (path-traversal safe)
    safe_sub = (subfolder.strip().replace("..", "").strip("/")) or uuid.uuid4().hex
    dest_dir = VOLUME_ROOT / safe_sub / artifact_type
    dest_dir.mkdir(parents=True, exist_ok=True)

    saved: list[dict] = []
    skipped: list[str] = []

    for upload in files:
        filename = Path(upload.filename or "unnamed").name  # strip any path prefix
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if ext not in _TEXT_EXTS:
            skipped.append(filename)
            logger.debug("Skipped non-text file: %s", filename)
            continue

        raw = await upload.read()
        if len(raw) > _MAX_UPLOAD_BYTES:
            skipped.append(filename)
            logger.warning("Skipped oversized file (%d bytes): %s", len(raw), filename)
            continue

        try:
            raw.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            skipped.append(filename)
            logger.debug("Skipped binary file: %s", filename)
            continue

        dest_path = dest_dir / filename
        dest_path.write_bytes(raw)
        rel_path = str(dest_path.relative_to(VOLUME_ROOT))

        saved.append({
            "filename": filename,
            "path": rel_path,
            "artifact_type": artifact_type,
            "size_bytes": len(raw),
        })
        logger.info("Saved to volume: %s (%d bytes)", rel_path, len(raw))

    if not saved and files:
        raise HTTPException(
            status_code=422,
            detail=f"No files could be saved. All {len(skipped)} file(s) were skipped (binary or unsupported extension).",
        )

    code_folder = f"{safe_sub}/code" if artifact_type == "code" else ""
    iac_folder  = f"{safe_sub}/iac"  if artifact_type == "iac"  else ""

    logger.info(
        "upload-to-volume: %d saved, %d skipped → %s/%s",
        len(saved), len(skipped), safe_sub, artifact_type,
    )

    return VolumeUploadResponse(
        saved=saved,
        skipped=skipped,
        volume_code_folder=code_folder,
        volume_iac_folder=iac_folder,
    )


@router.get("/volume-tree", response_model=list[str])
async def list_volume_tree(folder: str = "") -> list[str]:
    """List files available in the volume (for UI browsing)."""
    from src.tools.volume_reader import list_volume_tree
    try:
        return list_volume_tree(folder)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{key:path}", status_code=204)
async def delete_artifact(key: str) -> None:
    """Delete an artifact from object storage by its key."""
    client = get_client()
    if not client.is_available():
        raise HTTPException(status_code=503, detail="Object storage not configured.")
    try:
        client.delete(key)
    except Exception as exc:
        logger.warning("Failed to delete artifact '%s': %s", key, exc)
        raise HTTPException(status_code=404, detail=f"Artifact not found or delete failed: {exc}") from exc
