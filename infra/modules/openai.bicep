// ============================================================================
// Azure OpenAI Service
// Deploys: GPT-4o (orchestration + analysis) + GPT-4o-mini (lightweight tasks)
// WAF: Private endpoint, no public network access in prod, RBAC auth
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param keyVaultName string
param subnetId string

var openAiName = 'oai-${prefix}-${environmentName}'

// ── Azure OpenAI Account ───────────────────────────────────────────────────────
resource openAi 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: openAiName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: openAiName
    // WAF Security: disable key-based auth in prod, use RBAC
    disableLocalAuth: environmentName == 'prod'
    publicNetworkAccess: environmentName == 'prod' ? 'Disabled' : 'Enabled'
    networkAcls: {
      defaultAction: environmentName == 'prod' ? 'Deny' : 'Allow'
    }
  }
}

// ── Model Deployments ─────────────────────────────────────────────────────────

// Primary model: GPT-4o for orchestration and deep analysis
resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  name: 'gpt-4o'
  parent: openAi
  sku: {
    name: 'GlobalStandard'
    capacity: 100  // 100K TPM
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-11-20'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// Secondary model: GPT-4o-mini for lightweight tasks
resource gpt4oMiniDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  name: 'gpt-4o-mini'
  parent: openAi
  dependsOn: [gpt4oDeployment]
  sku: {
    name: 'GlobalStandard'
    capacity: 200  // 200K TPM
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o-mini'
      version: '2024-07-18'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// ── Private Endpoint (prod only) ──────────────────────────────────────────────
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-01-01' = if (environmentName == 'prod') {
  name: 'pe-${openAiName}'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'plsc-openai'
        properties: {
          privateLinkServiceId: openAi.id
          groupIds: ['account']
        }
      }
    ]
  }
}

// ── Store endpoint in Key Vault (WAF Security) ────────────────────────────────
resource kvSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/azure-openai-endpoint'
  properties: {
    value: openAi.properties.endpoint
    attributes: { enabled: true }
  }
}

output endpoint string = openAi.properties.endpoint
output openAiName string = openAi.name
output principalId string = openAi.identity.principalId
