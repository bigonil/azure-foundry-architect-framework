// ============================================================================
// Azure Container App — API service
// WAF: Auto-scaling, managed identity, no secrets in env vars
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param keyVaultName string
param openAiEndpoint string
param aiSearchEndpoint string
param aiFoundryConnectionString string
param containerAppsEnvId string
param acrLoginServer string

var apiAppName = 'ca-api-${prefix}-${environmentName}'

// ── API Container App ─────────────────────────────────────────────────────────
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: acrLoginServer
          identity: 'system'      // Pull from ACR using Managed Identity
        }
      ]
      secrets: [
        // Key Vault reference for MongoDB URI (WAF Security — no plaintext secrets)
        {
          name: 'mongodb-uri'
          keyVaultUrl: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/mongodb-uri'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acrLoginServer}/architect-framework-api:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'APP_ENV', value: environmentName }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
            { name: 'AZURE_SEARCH_ENDPOINT', value: aiSearchEndpoint }
            { name: 'AZURE_AI_PROJECT_CONNECTION_STRING', value: aiFoundryConnectionString }
            { name: 'MONGODB_URI', secretRef: 'mongodb-uri' }
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
