#!/usr/bin/env bash
# ==============================================================================
# setup-rbac.sh — Assign required RBAC roles to Managed Identities
# Run AFTER deploy.sh — assigns least-privilege roles (WAF Security pillar)
# ==============================================================================
set -euo pipefail

ENV="${1:-dev}"
PREFIX="afaf"
RG_NAME="rg-${PREFIX}-${ENV}"
SUBSCRIPTION_ID=$(az account show --query "id" -o tsv)

echo "🔐 Setting up RBAC for ${ENV} environment..."

# Get principal IDs
CA_PRINCIPAL=$(az containerapp show \
  --name "ca-api-${PREFIX}-${ENV}" \
  --resource-group "${RG_NAME}" \
  --query "identity.principalId" -o tsv)

OPENAI_NAME="oai-${PREFIX}-${ENV}"
SEARCH_NAME="srch-${PREFIX}-${ENV}"
KV_NAME="kv-${PREFIX}-${ENV}"

OPENAI_RESOURCE_ID=$(az cognitiveservices account show \
  --name "${OPENAI_NAME}" -g "${RG_NAME}" --query "id" -o tsv)

SEARCH_RESOURCE_ID=$(az search service show \
  --name "${SEARCH_NAME}" -g "${RG_NAME}" --query "id" -o tsv)

KV_RESOURCE_ID=$(az keyvault show \
  --name "${KV_NAME}" -g "${RG_NAME}" --query "id" -o tsv)

# ── Container App → Azure OpenAI ──────────────────────────────────────────────
echo "  Assigning: Container App → Cognitive Services OpenAI User"
az role assignment create \
  --assignee "${CA_PRINCIPAL}" \
  --role "Cognitive Services OpenAI User" \
  --scope "${OPENAI_RESOURCE_ID}" \
  --only-show-errors

# ── Container App → AI Search ─────────────────────────────────────────────────
echo "  Assigning: Container App → Search Index Data Reader"
az role assignment create \
  --assignee "${CA_PRINCIPAL}" \
  --role "Search Index Data Reader" \
  --scope "${SEARCH_RESOURCE_ID}" \
  --only-show-errors

# ── Container App → Key Vault ─────────────────────────────────────────────────
echo "  Assigning: Container App → Key Vault Secrets User"
az role assignment create \
  --assignee "${CA_PRINCIPAL}" \
  --role "Key Vault Secrets User" \
  --scope "${KV_RESOURCE_ID}" \
  --only-show-errors

echo ""
echo "✅ RBAC assignments complete"
echo "   All resources use Managed Identity — no secrets in environment variables"
