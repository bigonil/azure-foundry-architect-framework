#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — Deploy Azure Foundry Architect Framework to Azure
# Usage: ./scripts/deploy.sh [dev|staging|prod]
# Requires: az CLI, bicep CLI, Docker
# ==============================================================================
set -euo pipefail

ENV="${1:-dev}"
PREFIX="afaf"
LOCATION="westeurope"
RG_NAME="rg-${PREFIX}-${ENV}"

echo "🚀 Deploying Azure Foundry Architect Framework"
echo "   Environment : ${ENV}"
echo "   Location    : ${LOCATION}"
echo "   Resource Group: ${RG_NAME}"
echo ""

# ── 1. Azure Login Check ──────────────────────────────────────────────────────
echo "📋 Checking Azure login..."
az account show --query "name" -o tsv || { echo "❌ Not logged in. Run: az login"; exit 1; }
SUBSCRIPTION_ID=$(az account show --query "id" -o tsv)
echo "   Subscription: ${SUBSCRIPTION_ID}"

# ── 2. Infrastructure Deploy ──────────────────────────────────────────────────
echo ""
echo "🏗️  Deploying infrastructure (Bicep)..."
DEPLOY_OUTPUT=$(az deployment sub create \
  --name "afaf-${ENV}-$(date +%Y%m%d%H%M%S)" \
  --location "${LOCATION}" \
  --template-file infra/main.bicep \
  --parameters "infra/parameters/${ENV}.bicepparam" \
  --query "properties.outputs" \
  -o json)

echo "${DEPLOY_OUTPUT}" | python3 -c "
import json, sys
outputs = json.load(sys.stdin)
print('   ✅ Infrastructure deployed')
for k, v in outputs.items():
    print(f'   {k}: {v[\"value\"]}')
"

# Extract outputs
ACR_SERVER=$(echo "${DEPLOY_OUTPUT}" | python3 -c "
import json, sys; o=json.load(sys.stdin)
rg=o.get('resourceGroupName',{}).get('value','')
print(rg)
")

# ── 3. Build & Push Container Images ─────────────────────────────────────────
echo ""
echo "🐳 Building and pushing container images..."
ACR_NAME="acr${PREFIX}${ENV}"
az acr login --name "${ACR_NAME}"

# API
docker build -f docker/Dockerfile.api -t "${ACR_NAME}.azurecr.io/architect-framework-api:latest" .
docker push "${ACR_NAME}.azurecr.io/architect-framework-api:latest"
echo "   ✅ API image pushed"

# Client
docker build -f docker/Dockerfile.client -t "${ACR_NAME}.azurecr.io/architect-framework-client:latest" .
docker push "${ACR_NAME}.azurecr.io/architect-framework-client:latest"
echo "   ✅ Client image pushed"

# ── 4. Update Container App ───────────────────────────────────────────────────
echo ""
echo "♻️  Updating Container Apps to latest image..."
CA_NAME="ca-api-${PREFIX}-${ENV}"
az containerapp update \
  --name "${CA_NAME}" \
  --resource-group "${RG_NAME}" \
  --image "${ACR_NAME}.azurecr.io/architect-framework-api:latest"
echo "   ✅ Container App updated"

# ── 5. Get API URL ────────────────────────────────────────────────────────────
API_URL=$(az containerapp show \
  --name "${CA_NAME}" \
  --resource-group "${RG_NAME}" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo ""
echo "✅ Deployment complete!"
echo "   API URL: https://${API_URL}"
echo "   Docs:    https://${API_URL}/docs"
echo "   Health:  https://${API_URL}/health"
