// ============================================================================
// Azure Cosmos DB — Session state and report storage
// Uses NoSQL (Core SQL) API with serverless for cost optimization
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param subnetId string

var cosmosName = 'cosmos-${prefix}-${environmentName}'
var databaseName = 'architect-framework'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // WAF Cost Optimization: serverless for dev/staging, provisioned for prod
    capabilities: environmentName != 'prod' ? [
      { name: 'EnableServerless' }
    ] : []
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: environmentName == 'prod'
      }
    ]
    // WAF Reliability: backup policy
    backupPolicy: {
      type: environmentName == 'prod' ? 'Continuous' : 'Periodic'
      periodicModeProperties: environmentName != 'prod' ? {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Local'
      } : null
    }
    // WAF Security
    disableLocalAuth: false          // Keep enabled — Cosmos uses connection strings
    enableAutomaticFailover: environmentName == 'prod'
    publicNetworkAccess: environmentName == 'prod' ? 'Disabled' : 'Enabled'
    networkAclBypass: 'AzureServices'
    ipRules: []
    virtualNetworkRules: []
  }
}

// ── Database ──────────────────────────────────────────────────────────────────
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  name: databaseName
  parent: cosmosAccount
  properties: {
    resource: { id: databaseName }
  }
}

// ── Container: sessions ────────────────────────────────────────────────────────
resource sessionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: 'sessions'
  parent: database
  properties: {
    resource: {
      id: 'sessions'
      partitionKey: {
        paths: ['/session_id']
        kind: 'Hash'
      }
      defaultTtl: 604800    // 7 days TTL — sessions expire automatically
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

// ── Container: reports ────────────────────────────────────────────────────────
resource reportsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: 'reports'
  parent: database
  properties: {
    resource: {
      id: 'reports'
      partitionKey: {
        paths: ['/project_name']
        kind: 'Hash'
      }
      defaultTtl: 2592000   // 30 days TTL for reports
    }
  }
}

// ── Private Endpoint ──────────────────────────────────────────────────────────
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-01-01' = if (environmentName == 'prod') {
  name: 'pe-${cosmosName}'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'plsc-cosmos'
        properties: {
          privateLinkServiceId: cosmosAccount.id
          groupIds: ['Sql']
        }
      }
    ]
  }
}

output endpoint string = cosmosAccount.properties.documentEndpoint
output cosmosName string = cosmosAccount.name
output principalId string = cosmosAccount.identity.principalId
