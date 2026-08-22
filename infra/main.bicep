targetScope = 'resourceGroup'

@minLength(1)
@maxLength(64)
@description('azd environment name.')
param environmentName string

@minLength(1)
@description('Azure region for all resources.')
param location string

@description('Application name prefix.')
param appName string = 'mat-copilot'

@allowed([
  'copilot'
  'disabled'
])
@description('Backend LLM mode. Use disabled for deterministic demos without Copilot.')
param llmMode string = 'copilot'

@description('GitHub Copilot model id. Empty uses backend default.')
param copilotModel string = ''

@secure()
@description('GitHub/Copilot token injected as a Container Apps secret.')
param ghCopilotToken string

@description('Maximum active in-memory sessions.')
param maxActiveSessions int = 500

@description('Per-IP session creation limit per minute.')
param rateLimitSessionCreatePerMinute int = 5

@description('TTL sweep interval in seconds.')
param ttlSweepIntervalSec int = 300

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
}
var serviceTags = union(tags, {
  'azd-service-name': 'backend'
})
var safeAppName = replace(toLower(appName), '-', '')
var acrName = take('acr${safeAppName}${resourceToken}', 50)
var logName = 'log-${appName}-${resourceToken}'
var appInsightsName = 'appi-${appName}-${resourceToken}'
var storageName = take('st${safeAppName}${resourceToken}', 24)
var containerAppsEnvName = 'cae-${appName}-${resourceToken}'
var containerAppName = 'ca-${appName}-${resourceToken}'
var blobContainerName = 'mat-copilot'
var targetPort = 8000
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 3
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 3
    }
  }
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: blobContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppsEnvName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: serviceTags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: targetPort
        transport: 'auto'
      }
      secrets: [
        {
          name: 'azure-storage-connection-string'
          value: storageConnectionString
        }
        {
          name: 'applicationinsights-connection-string'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'gh-copilot-token'
          value: ghCopilotToken
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'main'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: string(targetPort)
            }
            {
              name: 'LLM_MODE'
              value: llmMode
            }
            {
              name: 'COPILOT_MODEL'
              value: copilotModel
            }
            {
              name: 'STATIC_DIR'
              value: '/app/static'
            }
            {
              name: 'SAMPLES_DIR'
              value: '/app/samples'
            }
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              secretRef: 'azure-storage-connection-string'
            }
            {
              name: 'BLOB_CONTAINER'
              value: blobContainerName
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'applicationinsights-connection-string'
            }
            {
              name: 'MAX_ACTIVE_SESSIONS'
              value: string(maxActiveSessions)
            }
            {
              name: 'RATE_LIMIT_SESSION_CREATE_PER_MINUTE'
              value: string(rateLimitSessionCreatePerMinute)
            }
            {
              name: 'TTL_SWEEP_INTERVAL_SEC'
              value: string(ttlSweepIntervalSec)
            }
            {
              name: 'GH_COPILOT_TOKEN'
              secretRef: 'gh-copilot-token'
            }
            {
              name: 'GITHUB_TOKEN'
              secretRef: 'gh-copilot-token'
            }
            {
              name: 'COPILOT_SDK_AUTH_TOKEN'
              secretRef: 'gh-copilot-token'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 20
              periodSeconds: 15
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.properties.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = acr.name
output AZURE_CONTAINER_APPS_ENVIRONMENT_NAME string = managedEnvironment.name
output APPLICATIONINSIGHTS_CONNECTION_STRING string = appInsights.properties.ConnectionString
output APPLICATIONINSIGHTS_NAME string = appInsights.name
output AZURE_STORAGE_ACCOUNT_NAME string = storage.name
output BLOB_CONTAINER string = blobContainer.name
output SERVICE_BACKEND_NAME string = containerApp.name
output SERVICE_BACKEND_ENDPOINT string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output BACKEND_URI string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
