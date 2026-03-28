// ============================================================================
// Azure Key Vault — secrets management (WAF Security pillar)
// RBAC-based access, soft delete, purge protection
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param subnetId string

var kvName = 'kv-${prefix}-${environmentName}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true    // RBAC over access policies (WAF Security)
    enableSoftDelete: true
    softDeleteRetentionInDays: environmentName == 'prod' ? 90 : 7
    enablePurgeProtection: environmentName == 'prod' ? true : null
    publicNetworkAccess: environmentName == 'prod' ? 'Disabled' : 'Enabled'
    networkAcls: {
      defaultAction: environmentName == 'prod' ? 'Deny' : 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-01-01' = if (environmentName == 'prod') {
  name: 'pe-${kvName}'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'plsc-kv'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: ['vault']
        }
      }
    ]
  }
}

output keyVaultName string = keyVault.name
output keyVaultUrl string = keyVault.properties.vaultUri
