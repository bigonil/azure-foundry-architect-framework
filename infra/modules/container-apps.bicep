// ============================================================================
// Azure Container Apps — Hosts the API and agent workers
// WAF: Auto-scaling, managed identity, no secrets in env vars
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param subnetId string
param logAnalyticsWorkspaceId string
param keyVaultName string
param openAiEndpoint string
param aiSearchEndpoint string
param cosmosDbEndpoint string
param aiFoundryConnectionString string

var envName = 'cae-${prefix}-${environmentName}'
var apiAppName = 'ca-api-${prefix}-${environmentName}'
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

// ── API Container App ─────────────────────────────────────────────────────────
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
        // WAF Performance: HTTP/2 enabled
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: 'system'      // Pull from ACR using Managed Identity
        }
      ]
      secrets: [
        // Key Vault references — no plaintext secrets (WAF Security)
        {
          name: 'cosmos-key'
          keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/cosmos-key'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acr.properties.loginServer}/architect-framework-api:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'APP_ENV', value: environmentName }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
            { name: 'AZURE_SEARCH_ENDPOINT', value: aiSearchEndpoint }
            { name: 'COSMOS_ENDPOINT', value: cosmosDbEndpoint }
            { name: 'AZURE_AI_PROJECT_CONNECTION_STRING', value: aiFoundryConnectionString }
            // No secrets in env vars — use Key Vault references above
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      // WAF Performance & Cost: scale 0→10 based on HTTP requests
      scale: {
        minReplicas: environmentName == 'prod' ? 1 : 0
        maxReplicas: environmentName == 'prod' ? 10 : 3
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output apiAppName string = apiApp.name
output apiPrincipalId string = apiApp.identity.principalId
output acrLoginServer string = acr.properties.loginServer
