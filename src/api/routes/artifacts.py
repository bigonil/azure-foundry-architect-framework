"""
Artifact upload routes — presigned URL generation for direct browser → storage uploads.

Flow
────
1. Browser: POST /api/artifacts/presign  { filename, artifact_type }
   ← { key, upload_url, method: "PUT", expires_in }
2. Browser: PUT upload_url  (file bytes, Content-Type: application/octet-stream)
   (goes directly to MinIO / Azure Blob — does NOT pass through this backend)
3. Browser: POST /api/analysis/start  { source_config: { type: "blob", artifacts: [...] } }
4. Backend: reads files from storage by key, runs analysis

DELETE /api/artifacts/{key} — cleanup after analysis or on user cancel.
"""
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config.settings import get_settings
from src.tools.blob_storage import get_client

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


@router.delete("/{key:path}", status_code=204)
async def delete_artifact(key: str) -> None:
    """Delete an uploaded artifact by its storage key."""
    client = get_client()
    if not client.is_available():
        raise HTTPException(status_code=503, detail="Object storage not configured.")
    try:
        client.delete(key)
    except Exception as exc:
        logger.warning("Failed to delete artifact '%s': %s", key, exc)
        raise HTTPException(status_code=404, detail=f"Artifact not found or delete failed: {exc}") from exc
