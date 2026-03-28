// ============================================================================
// Azure AI Foundry Hub + Project
// Deploys: AI Hub, AI Project, connections to OpenAI and AI Search
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param openAiEndpoint string
param aiSearchEndpoint string
param keyVaultName string
param logAnalyticsWorkspaceId string

var hubName = 'hub-${prefix}-${environmentName}'
var projectName = 'project-${prefix}-${environmentName}'
var storageAccountName = 'st${prefix}${environmentName}foundry'

// ── Storage Account (required by AI Hub) ──────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: environmentName == 'prod' ? 'Standard_ZRS' : 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // WAF Security: encryption at rest with Microsoft-managed keys
    encryption: {
      services: {
        blob: { enabled: true }
        file: { enabled: true }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

// ── AI Hub ────────────────────────────────────────────────────────────────────
resource aiHub 'Microsoft.MachineLearningServices/workspaces@2024-07-01-preview' = {
  name: hubName
  location: location
  tags: tags
  kind: 'Hub'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: 'Architect Framework AI Hub'
    description: 'Azure AI Foundry Hub for the Architect Framework multi-agent system'
    storageAccount: storage.id
    keyVault: resourceId('Microsoft.KeyVault/vaults', keyVaultName)
    // WAF Operational Excellence: diagnostics enabled
    publicNetworkAccess: environmentName == 'prod' ? 'Disabled' : 'Enabled'
  }
}

// ── Diagnostic Settings (WAF Operational Excellence) ─────────────────────────
resource hubDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'hub-diagnostics'
  scope: aiHub
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
        retentionPolicy: { enabled: true, days: 90 }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: { enabled: true, days: 30 }
      }
    ]
  }
}

// ── AI Project ────────────────────────────────────────────────────────────────
resource aiProject 'Microsoft.MachineLearningServices/workspaces@2024-07-01-preview' = {
  name: projectName
  location: location
  tags: tags
  kind: 'Project'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: 'Architect Framework Project'
    hubResourceId: aiHub.id
    publicNetworkAccess: environmentName == 'prod' ? 'Disabled' : 'Enabled'
  }
}

// ── Connection: Azure OpenAI ───────────────────────────────────────────────────
resource openAiConnection 'Microsoft.MachineLearningServices/workspaces/connections@2024-07-01-preview' = {
  name: 'conn-openai'
  parent: aiHub
  properties: {
    category: 'AzureOpenAI'
    target: openAiEndpoint
    authType: 'AAD'               // Managed Identity — no keys stored
    isSharedToAll: true
    metadata: {
      ApiType: 'Azure'
      ResourceId: resourceId('Microsoft.CognitiveServices/accounts', 'oai-${prefix}-${environmentName}')
    }
  }
}

// ── Connection: Azure AI Search ────────────────────────────────────────────────
resource searchConnection 'Microsoft.MachineLearningServices/workspaces/connections@2024-07-01-preview' = {
  name: 'conn-ai-search'
  parent: aiHub
  properties: {
    category: 'CognitiveSearch'
    target: aiSearchEndpoint
    authType: 'AAD'
    isSharedToAll: true
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output hubName string = aiHub.name
output projectName string = aiProject.name
output hubPrincipalId string = aiHub.identity.principalId
output projectPrincipalId string = aiProject.identity.principalId
// Connection string format: region.api.azureml.ms;subscriptionId;rgName;projectName
output connectionString string = '${location}.api.azureml.ms;${subscription().subscriptionId};${resourceGroup().name};${projectName}'
