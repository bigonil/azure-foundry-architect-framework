"""
blob_storage.py — unified object-storage abstraction for Efesto AI Fabryc.

Local (MinIO)       → boto3 with S3-compatible endpoint
Production (Azure)  → azure-storage-blob SDK

Both backends expose the same interface so no code change is needed when
migrating from MinIO to Azure Blob Storage — only environment variables change:

  Local                          │ Production
  ─────────────────────────────────────────────────────────
  STORAGE_BACKEND=minio          │ STORAGE_BACKEND=azure
  MINIO_ENDPOINT=http://minio:9000│ AZURE_STORAGE_ACCOUNT_NAME=<name>
  MINIO_ACCESS_KEY / SECRET_KEY  │ AZURE_STORAGE_CONNECTION_STRING (or MI)
  MINIO_BUCKET=efesto-artifacts  │ AZURE_STORAGE_CONTAINER=efesto-artifacts

Public API
──────────
  get_client()                   → BlobStorageClient singleton
  client.ensure_bucket()         → idempotent bucket/container creation
  client.generate_presigned_put_url(key, expiry_seconds) → str
  client.download(key)           → bytes
  client.delete(key)             → None
  client.is_available()          → bool
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import TYPE_CHECKING

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    pass


# ── Base class ────────────────────────────────────────────────────────────────

class BlobStorageClient:
    """Abstract base — do not instantiate directly; use get_client()."""

    def is_available(self) -> bool:
        return False

    def ensure_bucket(self) -> None:
        pass

    def generate_presigned_put_url(self, key: str, expiry_seconds: int = 3600) -> str:
        raise NotImplementedError

    def download(self, key: str) -> bytes:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError


# ── MinIO (boto3 / S3-compatible) ─────────────────────────────────────────────

class MinIOClient(BlobStorageClient):
    """
    Wraps boto3 to talk to MinIO (or any S3-compatible store).

    Two endpoints are tracked:
    - _internal_endpoint: used by backend for API calls (e.g. http://minio:9000)
    - _public_endpoint:   embedded in presigned URLs returned to the browser
                          (e.g. http://localhost:9000)
    """

    def __init__(
        self,
        internal_endpoint: str,
        public_endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
    ) -> None:
        import boto3
        from botocore.config import Config

        self._bucket = bucket
        self._public_endpoint = public_endpoint.rstrip("/")

        # Internal client for API operations (create bucket, download, delete)
        self._client = boto3.client(
            "s3",
            endpoint_url=internal_endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",  # MinIO requires any region name
        )

        # Public client — same creds but points to the public endpoint;
        # used *only* for generating presigned PUT URLs the browser can reach
        self._public_client = boto3.client(
            "s3",
            endpoint_url=public_endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )

    def is_available(self) -> bool:
        return True

    def ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket)
            logger.debug("MinIO bucket '%s' already exists", self._bucket)
        except Exception:
            self._client.create_bucket(Bucket=self._bucket)
            logger.info("MinIO bucket '%s' created", self._bucket)

    def generate_presigned_put_url(self, key: str, expiry_seconds: int = 3600) -> str:
        """
        Return a presigned URL the browser can use to PUT a file directly into MinIO.
        Uses _public_client so the URL contains the public (browser-accessible) endpoint.
        """
        url = self._public_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expiry_seconds,
        )
        return url

    def download(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


# ── Azure Blob Storage (azure-storage-blob SDK) ───────────────────────────────

class AzureBlobClient(BlobStorageClient):
    """
    Wraps azure-storage-blob for production deployments.

    Authentication priority:
    1. Connection string (AZURE_STORAGE_CONNECTION_STRING)
    2. DefaultAzureCredential (Managed Identity when running on Azure)
    """

    def __init__(
        self,
        account_name: str,
        connection_string: str,
        container: str,
        presign_expiry_seconds: int = 3600,
    ) -> None:
        from azure.storage.blob import BlobServiceClient

        self._container = container
        self._expiry_seconds = presign_expiry_seconds

        if connection_string:
            self._service = BlobServiceClient.from_connection_string(connection_string)
            self._account_key = self._extract_account_key(connection_string)
            self._account_name = account_name or self._extract_account_name(connection_string)
        else:
            # Managed Identity (production on Azure)
            from azure.identity import DefaultAzureCredential
            credential = DefaultAzureCredential()
            self._service = BlobServiceClient(
                account_url=f"https://{account_name}.blob.core.windows.net",
                credential=credential,
            )
            self._account_key = None
            self._account_name = account_name

    @staticmethod
    def _extract_account_name(conn_str: str) -> str:
        for part in conn_str.split(";"):
            if part.startswith("AccountName="):
                return part.split("=", 1)[1]
        return ""

    @staticmethod
    def _extract_account_key(conn_str: str) -> str | None:
        for part in conn_str.split(";"):
            if part.startswith("AccountKey="):
                return part.split("=", 1)[1]
        return None

    def is_available(self) -> bool:
        return True

    def ensure_bucket(self) -> None:
        container_client = self._service.get_container_client(self._container)
        try:
            container_client.get_container_properties()
            logger.debug("Azure container '%s' already exists", self._container)
        except Exception:
            container_client.create_container()
            logger.info("Azure container '%s' created", self._container)

    def generate_presigned_put_url(self, key: str, expiry_seconds: int = 3600) -> str:
        """Return a SAS URL the browser can use to PUT a blob directly."""
        from datetime import datetime, timedelta, timezone
        from azure.storage.blob import generate_blob_sas, BlobSasPermissions

        if not self._account_key:
            # Managed Identity — generate user-delegation SAS
            from azure.storage.blob import generate_blob_sas, UserDelegationKey
            udk: UserDelegationKey = self._service.get_user_delegation_key(
                key_start_time=datetime.now(timezone.utc),
                key_expiry_time=datetime.now(timezone.utc) + timedelta(seconds=expiry_seconds),
            )
            sas = generate_blob_sas(
                account_name=self._account_name,
                container_name=self._container,
                blob_name=key,
                user_delegation_key=udk,
                permission=BlobSasPermissions(write=True, create=True),
                expiry=datetime.now(timezone.utc) + timedelta(seconds=expiry_seconds),
            )
        else:
            sas = generate_blob_sas(
                account_name=self._account_name,
                container_name=self._container,
                blob_name=key,
                account_key=self._account_key,
                permission=BlobSasPermissions(write=True, create=True),
                expiry=datetime.now(timezone.utc) + timedelta(seconds=expiry_seconds),
            )
        return f"https://{self._account_name}.blob.core.windows.net/{self._container}/{key}?{sas}"

    def download(self, key: str) -> bytes:
        blob_client = self._service.get_blob_client(container=self._container, blob=key)
        return blob_client.download_blob().readall()

    def delete(self, key: str) -> None:
        blob_client = self._service.get_blob_client(container=self._container, blob=key)
        blob_client.delete_blob(delete_snapshots="include")


# ── No-op (disabled) ─────────────────────────────────────────────────────────

class DisabledStorageClient(BlobStorageClient):
    """Returned when STORAGE_BACKEND=disabled. All operations raise clearly."""

    def generate_presigned_put_url(self, key: str, expiry_seconds: int = 3600) -> str:
        raise RuntimeError("Object storage is disabled (STORAGE_BACKEND=disabled). Configure MinIO or Azure Blob Storage.")

    def download(self, key: str) -> bytes:
        raise RuntimeError("Object storage is disabled.")

    def delete(self, key: str) -> None:
        raise RuntimeError("Object storage is disabled.")


# ── Factory ───────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_client() -> BlobStorageClient:
    """
    Return the singleton BlobStorageClient based on STORAGE_BACKEND setting.
    Called once; result is cached for the process lifetime.
    """
    from src.config.settings import get_settings
    s = get_settings()

    if s.storage_backend == "minio":
        logger.info(
            "Object storage: MinIO at %s (public: %s), bucket '%s'",
            s.minio_endpoint, s.minio_public_endpoint, s.minio_bucket,
        )
        client = MinIOClient(
            internal_endpoint=s.minio_endpoint,
            public_endpoint=s.minio_public_endpoint,
            access_key=s.minio_access_key,
            secret_key=s.minio_secret_key,
            bucket=s.minio_bucket,
        )
        client.ensure_bucket()
        return client

    if s.storage_backend == "azure":
        if not s.azure_storage_account_name and not s.azure_storage_connection_string:
            raise RuntimeError(
                "STORAGE_BACKEND=azure requires AZURE_STORAGE_ACCOUNT_NAME "
                "or AZURE_STORAGE_CONNECTION_STRING"
            )
        logger.info(
            "Object storage: Azure Blob Storage, account '%s', container '%s'",
            s.azure_storage_account_name, s.azure_storage_container,
        )
        client = AzureBlobClient(
            account_name=s.azure_storage_account_name,
            connection_string=s.azure_storage_connection_string,
            container=s.azure_storage_container,
            presign_expiry_seconds=s.minio_presign_expiry_seconds,
        )
        client.ensure_bucket()
        return client

    logger.info("Object storage: disabled")
    return DisabledStorageClient()
