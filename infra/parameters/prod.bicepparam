using '../main.bicep'

param environmentName = 'prod'
param location = 'westeurope'
param prefix = 'afaf'
param tags = {
  Environment: 'prod'
  Application: 'azure-foundry-architect-framework'
  CostCenter: 'engineering'
  ManagedBy: 'bicep'
  CAFWorkload: 'ai-platform'
  Criticality: 'high'
}
