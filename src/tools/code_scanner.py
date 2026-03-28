"""
Code Scanner — static analysis tools used by the CodeAnalyzerAgent
for language detection, framework identification, and cloud SDK detection.
"""
import re
from pathlib import Path


LANGUAGE_MAP: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "JavaScript (React)",
    ".tsx": "TypeScript (React)",
    ".java": "Java",
    ".cs": "C#",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".scala": "Scala",
    ".tf": "Terraform (HCL)",
    ".bicep": "Bicep",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".json": "JSON",
    ".dockerfile": "Dockerfile",
}

FRAMEWORK_PATTERNS: dict[str, list[str]] = {
    "React": [r"from ['\"]react['\"]", r"import React"],
    "Vue.js": [r"from ['\"]vue['\"]", r"createApp\("],
    "Angular": [r"from ['\"]@angular/", r"@NgModule"],
    "Next.js": [r"from ['\"]next/", r"getServerSideProps"],
    "Express.js": [r"require\(['\"]express['\"]", r"from ['\"]express['\"]"],
    "FastAPI": [r"from fastapi import", r"@app\.(get|post|put|delete)"],
    "Django": [r"from django", r"django.conf"],
    "Flask": [r"from flask import", r"@app\.route"],
    "Spring Boot": [r"@SpringBootApplication", r"import org\.springframework"],
    "ASP.NET": [r"using Microsoft\.AspNetCore", r"WebApplication\.CreateBuilder"],
    "NestJS": [r"from ['\"]@nestjs/", r"@Controller\("],
    "Gin (Go)": [r"\"github\.com/gin-gonic/gin\"", r"gin\.Default\(\)"],
    "gRPC": [r"import grpc", r"grpc\.Server\(", r"google\.golang\.org/grpc"],
    "GraphQL": [r"import graphql", r"from ['\"]graphql", r"type Query \{"],
    "Kafka": [r"kafka", r"KafkaProducer", r"KafkaConsumer"],
    "RabbitMQ": [r"pika", r"amqp", r"RabbitMQ"],
}

CLOUD_SDK_PATTERNS: dict[str, list[str]] = {
    # AWS
    "AWS SDK (boto3/Python)": [r"import boto3", r"from boto3", r"from botocore"],
    "AWS SDK (JS)": [r"from ['\"]@aws-sdk/", r"require\(['\"]aws-sdk"],
    "AWS SDK (Java)": [r"import software\.amazon\.awssdk", r"import com\.amazonaws"],
    "AWS CDK": [r"from ['\"]aws-cdk-lib", r"import aws_cdk"],
    # Azure
    "Azure SDK (Python)": [r"from azure\.", r"import azure\."],
    "Azure SDK (JS)": [r"from ['\"]@azure/", r"require\(['\"]@azure/"],
    "Azure SDK (Java)": [r"import com\.azure\.", r"import com\.microsoft\.azure"],
    "Azure SDK (.NET)": [r"using Azure\.", r"using Microsoft\.Azure"],
    # GCP
    "GCP SDK (Python)": [r"from google\.cloud import", r"import google\.cloud"],
    "GCP SDK (JS)": [r"from ['\"]@google-cloud/", r"require\(['\"]@google-cloud"],
    "GCP SDK (Java)": [r"import com\.google\.cloud"],
    # Cloud-specific config patterns
    "AWS S3 References": [r"s3://", r"amazonaws\.com/s3", r"S3Client", r"AmazonS3"],
    "AWS Lambda": [r"def handler\(event, context\)", r"exports\.handler"],
    "Azure Blob": [r"blob\.core\.windows\.net", r"BlobServiceClient"],
    "Azure Functions": [r"import azure\.functions", r"@app\.route\(.*trigger"],
    "GCP Cloud Run": [r"PORT.*8080", r"K_SERVICE"],
    # Hard-coded regions
    "Hard-coded AWS Region": [r"us-east-1|us-west-2|eu-west-1|ap-southeast-1"],
    "Hard-coded GCP Region": [r"us-central1|europe-west1|asia-east1"],
}


class CodeScanner:
    """Static code analysis utilities for the CodeAnalyzerAgent."""

    def detect_language(self, filename: str) -> str | None:
        suffix = Path(filename).suffix.lower()
        if Path(filename).name.lower() == "dockerfile":
            return "Dockerfile"
        return LANGUAGE_MAP.get(suffix)

    def detect_frameworks(self, content: str, filename: str) -> list[str]:
        detected = []
        for framework, patterns in FRAMEWORK_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    detected.append(framework)
                    break
        return detected

    def detect_cloud_sdks(self, content: str) -> list[str]:
        detected = []
        for sdk_name, patterns in CLOUD_SDK_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    detected.append(sdk_name)
                    break
        return detected

    def check_twelve_factor(self, content: str, filename: str) -> dict[str, bool]:
        """Check for 12-factor app compliance indicators."""
        return {
            "config_via_env": bool(re.search(r"os\.environ|process\.env|os\.getenv", content)),
            "no_hardcoded_secrets": not bool(
                re.search(r'(?i)(password|secret|api_key|token)\s*=\s*["\'][^"\']{8,}', content)
            ),
            "logs_to_stdout": bool(re.search(r"console\.log|print\(|logger\.", content)),
            "health_endpoint": bool(re.search(r"/health|/ping|/ready|/live", content)),
            "graceful_shutdown": bool(
                re.search(r"SIGTERM|SIGINT|process\.on\(['\"]exit", content)
            ),
        }

    def detect_hardcoded_secrets(self, content: str) -> list[dict]:
        """Scan for hardcoded secrets (critical security finding)."""
        patterns = [
            (r'(?i)password\s*=\s*["\']([^"\']{8,})["\']', "password"),
            (r'(?i)api[_-]?key\s*=\s*["\']([^"\']{16,})["\']', "api_key"),
            (r'(?i)secret\s*=\s*["\']([^"\']{16,})["\']', "secret"),
            (r'AKIA[0-9A-Z]{16}', "aws_access_key"),
            (r'(?i)connection[_-]?string\s*=\s*["\']([^"\']{20,})["\']', "connection_string"),
        ]
        findings = []
        for pattern, secret_type in patterns:
            matches = re.finditer(pattern, content)
            for match in matches:
                findings.append({
                    "type": secret_type,
                    "severity": "CRITICAL",
                    "match_preview": match.group(0)[:30] + "...",
                })
        return findings
