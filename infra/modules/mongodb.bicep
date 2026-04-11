// ============================================================================
// MongoDB — Session state and report storage
// Self-hosted MongoDB 7 on Azure Container Apps with Azure Files persistence
// WAF: Cost-optimised (no PaaS license fee), portable, open-source
// ============================================================================

param prefix string
param environmentName string
param location string
param tags object
param subnetId string
param containerAppsEnvId string  // Shared Container Apps Environment

var mongoName   = 'ca-mongo-${prefix}-${environmentName}'
var storageName = replace('stmongo${prefix}${environmentName}', '-', '')
var fileShareName = 'mongodata'
var mongoPort   = 27017

// ── Azure Files — persistent volume for MongoDB data ─────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: {
    name: environmentName == 'prod' ? 'Standard_ZRS' : 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  name: fileShareName
  parent: fileService
  properties: {
    shareQuota: environmentName == 'prod' ? 100 : 32  // GiB
    enabledProtocols: 'SMB'
  }
}

// ── Mount storage in Container Apps Environment ───────────────────────────────
resource caeStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  name: 'mongo-storage'
  parent: existingCae
  properties: {
    azureFile: {
      accountName: storageAccount.name
      accountKey: storageAccount.listKeys().keys[0].value
      shareName: fileShareName
      accessMode: 'ReadWrite'
    }
  }
}

resource existingCae 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: last(split(containerAppsEnvId, '/'))
}

// ── MongoDB Container App ─────────────────────────────────────────────────────
resource mongoApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: mongoName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      // Internal only — not exposed outside the VNet
      ingress: {
        external: false
        targetPort: mongoPort
        transport: 'tcp'
        exposedPort: mongoPort
      }
      secrets: [
        {
          name: 'mongo-initdb-root-password'
          value: uniqueString(resourceGroup().id, prefix, 'mongo')
        }
      ]
    }
    template: {
      volumes: [
        {
          name: 'mongodata'
          storageType: 'AzureFile'
          storageName: 'mongo-storage'
        }
      ]
      containers: [
        {
          name: 'mongodb'
          image: 'mongo:7'
          resources: {
            cpu: json(environmentName == 'prod' ? '1.0' : '0.5')
            memory: environmentName == 'prod' ? '2Gi' : '1Gi'
          }
          env: [
            { name: 'MONGO_INITDB_ROOT_USERNAME', value: 'admin' }
            { name: 'MONGO_INITDB_ROOT_PASSWORD', secretRef: 'mongo-initdb-root-password' }
            { name: 'MONGO_INITDB_DATABASE', value: 'architect-framework' }
          ]
          volumeMounts: [
            {
              volumeName: 'mongodata'
              mountPath: '/data/db'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              exec: {
                command: ['mongosh', '--eval', 'db.adminCommand("ping")']
              }
              initialDelaySeconds: 20
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              exec: {
                command: ['mongosh', '--eval', 'db.adminCommand("ping")']
              }
              initialDelaySeconds: 10
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        // MongoDB must have exactly 1 replica (stateful)
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  dependsOn: [caeStorage]
}

// ── Outputs ───────────────────────────────────────────────────────────────────
var mongoPassword = uniqueString(resourceGroup().id, prefix, 'mongo')
output mongoUri string = 'mongodb://admin:${mongoPassword}@${mongoName}:${mongoPort}/architect-framework?authSource=admin'
output mongoAppName string = mongoApp.name
output storageName string = storageAccount.name
