// ============================================================================
// Container Apps Environment + ACR — shared infrastructure
// Extracted so MongoDB and the API app both reference the same environment
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param subnetId string
param logAnalyticsWorkspaceId string

var envName = 'cae-${prefix}-${environmentName}'
var acrName = 'acr${prefix}${environmentName}'

// ── Container Registry ────────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: environmentName == 'prod' ? 'Premium' : 'Basic'
  }
  properties: {
    adminUserEnabled: false           // WAF Security: use Managed Identity pull
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: environmentName == 'prod' ? 'Enabled' : 'Disabled'
  }
}

// ── Container Apps Environment ────────────────────────────────────────────────
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2022-10-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2022-10-01').primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: subnetId
      internal: environmentName == 'prod'
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

output environmentId string = environment.id
output environmentName string = environment.name
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
