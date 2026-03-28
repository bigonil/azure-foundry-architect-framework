// ============================================================================
// Networking — VNet, Subnets, NSGs following CAF Hub-Spoke topology
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object

var vnetName = 'vnet-${prefix}-${environmentName}'
var nsgName = 'nsg-${prefix}-${environmentName}'

// ── Network Security Group ────────────────────────────────────────────────────
resource nsg 'Microsoft.Network/networkSecurityGroups@2024-01-01' = {
  name: nsgName
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          description: 'Deny all inbound — WAF Zero Trust'
        }
      }
      {
        name: 'AllowAzureLoadBalancer'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'AzureLoadBalancer'
          destinationAddressPrefix: '*'
        }
      }
    ]
  }
}

// ── Virtual Network ───────────────────────────────────────────────────────────
resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/16']
    }
    subnets: [
      {
        name: 'snet-container-apps'
        properties: {
          addressPrefix: '10.0.0.0/23'    // /23 minimum for Container Apps infra subnet
          networkSecurityGroup: { id: nsg.id }
          delegations: [
            {
              name: 'Microsoft.App/environments'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
      {
        name: 'snet-private-endpoints'
        properties: {
          addressPrefix: '10.0.2.0/24'
          networkSecurityGroup: { id: nsg.id }
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

output vnetId string = vnet.id
output containerAppsSubnetId string = '${vnet.id}/subnets/snet-container-apps'
output privateEndpointSubnetId string = '${vnet.id}/subnets/snet-private-endpoints'
