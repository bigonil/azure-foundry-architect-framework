"""
Infrastructure Parser — parses IaC artifacts for the InfraAnalyzerAgent.
Supports Terraform HCL, Bicep, ARM, Kubernetes YAML, Docker Compose.
"""
import json
import logging
import re
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)


# Terraform resource type → friendly name mapping
TF_RESOURCE_MAP: dict[str, str] = {
    # AWS
    "aws_instance": "EC2 Instance",
    "aws_s3_bucket": "S3 Bucket",
    "aws_rds_instance": "RDS Database",
    "aws_lambda_function": "Lambda Function",
    "aws_ecs_service": "ECS Service",
    "aws_eks_cluster": "EKS Cluster",
    "aws_vpc": "VPC",
    "aws_lb": "Application Load Balancer",
    "aws_elasticache_cluster": "ElastiCache",
    "aws_dynamodb_table": "DynamoDB Table",
    "aws_sqs_queue": "SQS Queue",
    "aws_sns_topic": "SNS Topic",
    # Azure
    "azurerm_virtual_machine": "Azure VM",
    "azurerm_storage_account": "Storage Account",
    "azurerm_sql_server": "Azure SQL Server",
    "azurerm_kubernetes_cluster": "AKS Cluster",
    "azurerm_function_app": "Azure Functions",
    "azurerm_app_service": "App Service",
    "azurerm_cosmosdb_account": "Cosmos DB",        # legacy mapping kept for analysis
    "azurerm_mongodb_cluster": "MongoDB Cluster",
    "azurerm_redis_cache": "Azure Cache for Redis",
    "azurerm_servicebus_namespace": "Service Bus",
    # GCP
    "google_compute_instance": "GCP VM Instance",
    "google_storage_bucket": "GCS Bucket",
    "google_sql_database_instance": "Cloud SQL",
    "google_container_cluster": "GKE Cluster",
    "google_cloudfunctions_function": "Cloud Functions",
    "google_pubsub_topic": "Pub/Sub Topic",
}


class InfraParser:
    """Parses IaC files to extract resource inventory."""

    def detect_iac_type(self, filename: str, content: str) -> str:
        """Detect the IaC format of a file."""
        name = Path(filename).name.lower()
        suffix = Path(filename).suffix.lower()

        if suffix == ".tf":
            return "terraform"
        if suffix == ".bicep":
            return "bicep"
        if name.endswith(".parameters.json") or (
            suffix == ".json" and '"$schema"' in content and "deploymentTemplate" in content
        ):
            return "arm"
        if suffix in (".yaml", ".yml"):
            if "apiVersion:" in content and "kind:" in content:
                if "services:" in content and "volumes:" in content:
                    return "docker-compose"
                return "kubernetes"
            if "AWSTemplateFormatVersion" in content:
                return "cloudformation"
        return "unknown"

    def extract_resources(
        self, content: str, iac_type: str
    ) -> list[dict[str, Any]]:
        """Extract resource list from IaC content."""
        if iac_type == "terraform":
            return self._parse_terraform(content)
        if iac_type == "kubernetes":
            return self._parse_kubernetes(content)
        if iac_type == "docker-compose":
            return self._parse_docker_compose(content)
        if iac_type == "arm":
            return self._parse_arm(content)
        return []

    def _parse_terraform(self, content: str) -> list[dict[str, Any]]:
        """Extract resources from Terraform HCL."""
        resources = []
        # Match: resource "type" "name" {
        pattern = re.compile(r'resource\s+"([^"]+)"\s+"([^"]+)"\s*\{', re.MULTILINE)
        for match in pattern.finditer(content):
            resource_type = match.group(1)
            resource_name = match.group(2)
            friendly_name = TF_RESOURCE_MAP.get(resource_type, resource_type)
            provider = resource_type.split("_")[0] if "_" in resource_type else "unknown"

            # Extract key properties inline
            block_start = match.end()
            block_content = self._extract_hcl_block(content, block_start)

            resources.append({
                "type": resource_type,
                "name": resource_name,
                "friendly_name": friendly_name,
                "provider": self._map_provider(provider),
                "properties": self._extract_key_properties(block_content),
            })
        return resources

    def _map_provider(self, prefix: str) -> str:
        mapping = {"aws": "AWS", "azurerm": "Azure", "google": "GCP", "azuread": "Azure AD"}
        return mapping.get(prefix, prefix.upper())

    def _extract_hcl_block(self, content: str, start: int, max_chars: int = 500) -> str:
        """Extract the content of an HCL block (simplified)."""
        return content[start : start + max_chars]

    def _extract_key_properties(self, block: str) -> dict[str, str]:
        """Extract key=value pairs from an HCL block."""
        props: dict[str, str] = {}
        for match in re.finditer(r'(\w+)\s*=\s*"([^"]*)"', block):
            key, value = match.group(1), match.group(2)
            if key in ("location", "region", "instance_type", "vm_size", "tier", "sku"):
                props[key] = value
        return props

    def _parse_kubernetes(self, content: str) -> list[dict[str, Any]]:
        """Extract resources from Kubernetes YAML manifests."""
        resources = []
        try:
            docs = list(yaml.safe_load_all(content))
            for doc in docs:
                if not doc or not isinstance(doc, dict):
                    continue
                resources.append({
                    "type": f"k8s/{doc.get('kind', 'unknown')}",
                    "name": doc.get("metadata", {}).get("name", "unknown"),
                    "friendly_name": f"Kubernetes {doc.get('kind', 'Resource')}",
                    "provider": "Kubernetes",
                    "properties": {
                        "namespace": doc.get("metadata", {}).get("namespace", "default"),
                        "api_version": doc.get("apiVersion", ""),
                    },
                })
        except yaml.YAMLError as e:
            logger.warning(f"Failed to parse Kubernetes YAML: {e}")
        return resources

    def _parse_docker_compose(self, content: str) -> list[dict[str, Any]]:
        """Extract services from Docker Compose."""
        resources = []
        try:
            data = yaml.safe_load(content)
            if not data:
                return []
            for svc_name, svc_config in (data.get("services") or {}).items():
                resources.append({
                    "type": "docker/service",
                    "name": svc_name,
                    "friendly_name": f"Docker Service: {svc_name}",
                    "provider": "Docker",
                    "properties": {
                        "image": svc_config.get("image", "build") if svc_config else "unknown",
                        "ports": str(svc_config.get("ports", [])) if svc_config else "",
                    },
                })
        except yaml.YAMLError as e:
            logger.warning(f"Failed to parse Docker Compose: {e}")
        return resources

    def _parse_arm(self, content: str) -> list[dict[str, Any]]:
        """Extract resources from ARM templates."""
        resources = []
        try:
            data = json.loads(content)
            for res in data.get("resources", []):
                resources.append({
                    "type": res.get("type", "unknown"),
                    "name": res.get("name", "unknown"),
                    "friendly_name": res.get("type", "Azure Resource").split("/")[-1],
                    "provider": "Azure",
                    "properties": {
                        "api_version": res.get("apiVersion", ""),
                        "location": res.get("location", ""),
                    },
                })
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse ARM template: {e}")
        return resources
