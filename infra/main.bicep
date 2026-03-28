// ============================================================================
// Azure Foundry Architect Framework — Main Infrastructure
// Follows: CAF Landing Zone + WAF best practices
// Resources: AI Foundry Hub, OpenAI, AI Search, Cosmos DB, Container Apps
// ============================================================================

targetScope = 'subscription'

@description('Environment name: dev | staging | prod')
@allowed(['dev', 'staging', 'prod'])
param environmentName string = 'dev'

@description('Azure region for all resources')
param location string = 'westeurope'

@description('Unique prefix for resource names (3-8 chars, lowercase)')
@minLength(3)
@maxLength(8)
param prefix string = 'afaf'

@description('Tags applied to all resources (CAF governance)')
param tags object = {
  Environment: environmentName
  Application: 'azure-foundry-architect-framework'
  CostCenter: 'engineering'
  ManagedBy: 'bicep'
  CAFWorkload: 'ai-platform'
}

// ── Resource Group ────────────────────────────────────────────────────────────
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${prefix}-${environmentName}'
  location: location
  tags: tags
}

// ── Modules ───────────────────────────────────────────────────────────────────

module networking 'modules/networking.bicep' = {
  name: 'networking'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
    subnetId: networking.outputs.privateEndpointSubnetId
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
  }
}

module openAi 'modules/openai.bicep' = {
  name: 'openai'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
    subnetId: networking.outputs.privateEndpointSubnetId
  }
}

module aiSearch 'modules/ai-search.bicep' = {
  name: 'ai-search'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
    subnetId: networking.outputs.privateEndpointSubnetId
  }
}

module cosmosDb 'modules/cosmosdb.bicep' = {
  name: 'cosmosdb'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
    subnetId: networking.outputs.privateEndpointSubnetId
  }
}

module aiFoundry 'modules/ai-foundry.bicep' = {
  name: 'ai-foundry'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
    openAiEndpoint: openAi.outputs.endpoint
    aiSearchEndpoint: aiSearch.outputs.endpoint
    keyVaultName: keyVault.outputs.keyVaultName
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'container-apps'
  scope: rg
  params: {
    prefix: prefix
    environmentName: environmentName
    location: location
    tags: tags
    subnetId: networking.outputs.containerAppsSubnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    keyVaultName: keyVault.outputs.keyVaultName
    openAiEndpoint: openAi.outputs.endpoint
    aiSearchEndpoint: aiSearch.outputs.endpoint
    cosmosDbEndpoint: cosmosDb.outputs.endpoint
    aiFoundryConnectionString: aiFoundry.outputs.connectionString
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output resourceGroupName string = rg.name
output apiUrl string = containerApps.outputs.apiUrl
output aiFoundryConnectionString string = aiFoundry.outputs.connectionString
output openAiEndpoint string = openAi.outputs.endpoint
output aiSearchEndpoint string = aiSearch.outputs.endpoint
output cosmosDbEndpoint string = cosmosDb.outputs.endpoint
output keyVaultUrl string = keyVault.outputs.keyVaultUrl
