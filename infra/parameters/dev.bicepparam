using '../main.bicep'

param environmentName = 'dev'
param location = 'westeurope'
param prefix = 'afaf'
param tags = {
  Environment: 'dev'
  Application: 'azure-foundry-architect-framework'
  CostCenter: 'engineering'
  ManagedBy: 'bicep'
}
