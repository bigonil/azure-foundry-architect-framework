// ============================================================================
// Azure AI Search — Knowledge Base for CAF/WAF guidelines and migration patterns
// Indexes: caf-guidelines, waf-pillars, migration-patterns
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param subnetId string

var searchName = 'srch-${prefix}-${environmentName}'

resource aiSearch 'Microsoft.Search/searchServices@2024-06-01-preview' = {
  name: searchName
  location: location
  tags: tags
  sku: {
    name: environmentName == 'prod' ? 'standard' : 'basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    replicaCount: environmentName == 'prod' ? 2 : 1
    partitionCount: 1
    hostingMode: 'default'
    // WAF Security: disable API key auth in prod
    disableLocalAuth: environmentName == 'prod'
    authOptions: environmentName != 'prod' ? {
      aadOrApiKey: { aadAuthFailureMode: 'http401WithBearerChallenge' }
    } : null
    publicNetworkAccess: environmentName == 'prod' ? 'disabled' : 'enabled'
    semanticSearch: 'standard'       // Enable semantic search for better RAG results
  }
}

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-01-01' = if (environmentName == 'prod') {
  name: 'pe-${searchName}'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'plsc-search'
        properties: {
          privateLinkServiceId: aiSearch.id
          groupIds: ['searchService']
        }
      }
    ]
  }
}

output endpoint string = 'https://${searchName}.search.windows.net'
output searchName string = aiSearch.name
output principalId string = aiSearch.identity.principalId
