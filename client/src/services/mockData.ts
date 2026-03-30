/**
 * Demo mock data — realistic reports for CTO presentation.
 * Three sample projects covering the main use cases.
 */
import type { AnalysisReport, SessionStatus } from './api'

// ─── Demo Session IDs ────────────────────────────────────────────────────────
export const DEMO_SESSION_IDS = {
  contoso: 'demo-contoso-ecommerce-001',
  techcorp: 'demo-techcorp-legacy-crm-002',
  finserv: 'demo-finserv-trading-api-003',
}

// ─── Helper ──────────────────────────────────────────────────────────────────
const hoursAgo = (h: number) => Date.now() / 1000 - h * 3600

// ─── Demo Sessions ───────────────────────────────────────────────────────────
export const DEMO_SESSIONS: SessionStatus[] = [
  {
    session_id: DEMO_SESSION_IDS.contoso,
    status: 'completed',
    project_name: 'Contoso E-Commerce Platform',
    elapsed_seconds: 187,
  },
  {
    session_id: DEMO_SESSION_IDS.techcorp,
    status: 'completed',
    project_name: 'TechCorp Legacy CRM',
    elapsed_seconds: 214,
  },
  {
    session_id: DEMO_SESSION_IDS.finserv,
    status: 'completed',
    project_name: 'FinServ Trading API',
    elapsed_seconds: 156,
  },
]

// ─── Agent Results (shared structure) ────────────────────────────────────────
const makeAgentResults = (durations: number[]) => ({
  code_analyzer: { agent_name: 'Code Analyzer', status: 'success' as const, duration_seconds: durations[0] },
  infra_analyzer: { agent_name: 'Infra Analyzer', status: 'success' as const, duration_seconds: durations[1] },
  cost_optimizer: { agent_name: 'Cost Optimizer', status: 'success' as const, duration_seconds: durations[2] },
  migration_planner: { agent_name: 'Migration Planner', status: 'success' as const, duration_seconds: durations[3] },
  gap_analyzer: { agent_name: 'GAP Analyzer', status: 'success' as const, duration_seconds: durations[4] },
  waf_reviewer: { agent_name: 'WAF Reviewer', status: 'success' as const, duration_seconds: durations[5] },
})

// ═════════════════════════════════════════════════════════════════════════════
// REPORT 1 — Contoso E-Commerce Platform (AWS → Azure)
// ═════════════════════════════════════════════════════════════════════════════
export const DEMO_REPORT_CONTOSO: AnalysisReport = {
  session_id: DEMO_SESSION_IDS.contoso,
  project_name: 'Contoso E-Commerce Platform',
  source_cloud: 'aws',
  target_cloud: 'azure',
  status: 'completed',
  created_at: hoursAgo(2),
  agent_results: makeAgentResults([28.4, 22.1, 31.7, 35.2, 26.8, 29.5]),
  synthesis: {
    executive_summary:
      'The Contoso E-Commerce Platform is a well-structured, microservices-based application currently running on AWS with 14 services across ECS, RDS (PostgreSQL), ElastiCache (Redis), S3, CloudFront, and SQS. ' +
      'The codebase demonstrates strong software engineering practices with 78% test coverage and a clear domain-driven design. ' +
      'However, there are significant cloud-coupling points in the messaging layer (SQS) and storage layer (S3 SDK) that require re-platforming. ' +
      'We recommend a phased Re-Platform strategy targeting Azure Container Apps, Azure Database for PostgreSQL Flexible Server, Azure Cache for Redis, Blob Storage, and Azure Front Door. ' +
      'This migration will achieve an estimated 32% monthly cost reduction ($4,200/mo) through reserved instances, Azure Hybrid Benefit, and right-sizing, while improving operational maturity from 3.2 to 4.5 on the WAF scale within 24 weeks.',
    maturity_score: 3.2,
    recommended_strategy: 'Re-Platform — Migrate to Azure PaaS services with minimal code changes, leveraging managed services for operational excellence',
    estimated_migration_duration_weeks: 24,
    estimated_cost_savings_monthly_usd: 4200,
    key_findings: [
      'Microservices architecture with 14 independent services — well-suited for Container Apps deployment',
      'PostgreSQL 15 on RDS with read replicas — direct mapping to Azure Database for PostgreSQL Flexible Server',
      'Redis 7.x caching layer — compatible with Azure Cache for Redis Enterprise',
      'SQS-based event-driven architecture — requires migration to Azure Service Bus (moderate effort)',
      'S3 storage with pre-signed URLs — requires Blob Storage SDK migration with SAS token pattern',
      'CloudFront CDN with custom domain — direct replacement with Azure Front Door + CDN',
      '78% unit test coverage with integration tests — strong safety net for migration',
      'Terraform IaC (42 resources) — needs conversion to Bicep or Terraform AzureRM provider',
      'CI/CD on GitHub Actions — reusable with Azure deployment targets',
      'No hardcoded secrets detected — uses AWS Secrets Manager, map to Azure Key Vault',
    ],
    critical_risks: [
      'SQS → Service Bus migration requires message format changes and consumer retry logic refactoring (2-3 weeks effort)',
      'RDS Multi-AZ failover behavior differs from Azure PostgreSQL HA — requires DR testing validation',
      'CloudFront Lambda@Edge functions (3) have no direct Azure equivalent — rewrite as Azure Functions or Front Door Rules Engine',
      'AWS Cognito authentication — migration to Azure AD B2C requires user data export and token format changes',
      'ECS Task Definitions with custom health checks — need mapping to Container Apps health probes with different semantics',
    ],
    top_10_actions: [
      {
        priority: 1,
        action: 'Set up Azure Landing Zone with Hub-Spoke VNet topology and Private Endpoints for all PaaS services',
        owner: 'Platform Team',
        timeline: 'Week 1-2',
        effort: 'Medium',
        impact: 'critical',
      },
      {
        priority: 2,
        action: 'Provision Azure Database for PostgreSQL Flexible Server with geo-redundancy and configure pgBouncer connection pooling',
        owner: 'Database Team',
        timeline: 'Week 2-3',
        effort: 'Medium',
        impact: 'critical',
      },
      {
        priority: 3,
        action: 'Migrate authentication from AWS Cognito to Azure AD B2C with custom policies and user data migration',
        owner: 'Identity Team',
        timeline: 'Week 3-6',
        effort: 'High',
        impact: 'critical',
      },
      {
        priority: 4,
        action: 'Refactor SQS consumers to Azure Service Bus SDK — implement dead-letter queue handling and session-based processing',
        owner: 'Backend Team',
        timeline: 'Week 4-7',
        effort: 'High',
        impact: 'high',
      },
      {
        priority: 5,
        action: 'Replace S3 SDK calls with Azure Blob Storage SDK and implement SAS token generation for pre-signed URLs',
        owner: 'Backend Team',
        timeline: 'Week 5-8',
        effort: 'Medium',
        impact: 'high',
      },
      {
        priority: 6,
        action: 'Deploy microservices to Azure Container Apps with auto-scaling rules and Dapr sidecar for service discovery',
        owner: 'Platform Team',
        timeline: 'Week 8-12',
        effort: 'High',
        impact: 'high',
      },
      {
        priority: 7,
        action: 'Configure Azure Front Door with WAF policies, custom domains, and SSL certificates for CDN replacement',
        owner: 'Network Team',
        timeline: 'Week 10-12',
        effort: 'Medium',
        impact: 'medium',
      },
      {
        priority: 8,
        action: 'Rewrite Lambda@Edge functions as Azure Functions with Front Door Rules Engine integration',
        owner: 'Backend Team',
        timeline: 'Week 10-14',
        effort: 'High',
        impact: 'medium',
      },
      {
        priority: 9,
        action: 'Convert Terraform AWS provider resources to Bicep modules with parameterized environments (dev/staging/prod)',
        owner: 'DevOps Team',
        timeline: 'Week 12-16',
        effort: 'Medium',
        impact: 'medium',
      },
      {
        priority: 10,
        action: 'Execute performance benchmarking and DR failover testing across all Azure services before production cutover',
        owner: 'QA Team',
        timeline: 'Week 20-24',
        effort: 'High',
        impact: 'critical',
      },
    ],
    roadmap_phases: [
      {
        phase: 1,
        name: 'Foundation & Landing Zone',
        duration_weeks: 4,
        objectives: [
          'Deploy Hub-Spoke network topology with Private DNS Zones',
          'Provision Azure Database for PostgreSQL with data migration via DMS',
          'Set up Azure Container Registry and CI/CD pipelines',
          'Configure Azure Key Vault with secrets from AWS Secrets Manager',
        ],
        key_milestones: [
          'Landing Zone deployed and validated',
          'Database migration completed with < 5min downtime',
          'CI/CD pipeline building and deploying to dev environment',
        ],
      },
      {
        phase: 2,
        name: 'Core Services Migration',
        duration_weeks: 8,
        objectives: [
          'Migrate identity layer from Cognito to Azure AD B2C',
          'Refactor messaging from SQS to Azure Service Bus',
          'Replace S3 storage with Azure Blob Storage',
          'Deploy first wave of microservices (Order, Product, User) to Container Apps',
        ],
        key_milestones: [
          'User authentication working on Azure AD B2C',
          'All 14 microservices deployed to staging',
          'End-to-end integration tests passing',
        ],
      },
      {
        phase: 3,
        name: 'CDN, Edge & Optimization',
        duration_weeks: 6,
        objectives: [
          'Replace CloudFront with Azure Front Door + CDN',
          'Rewrite Lambda@Edge as Azure Functions',
          'Implement Azure Monitor, Application Insights, and Log Analytics',
          'Convert IaC from Terraform AWS to Bicep',
        ],
        key_milestones: [
          'Full observability stack operational',
          'Infrastructure as Code covering 100% of Azure resources',
          'Performance parity with AWS deployment confirmed',
        ],
      },
      {
        phase: 4,
        name: 'Validation & Production Cutover',
        duration_weeks: 6,
        objectives: [
          'Complete performance and load testing (target: 10K concurrent users)',
          'Execute DR failover and recovery procedures',
          'Implement Azure cost management alerts and FinOps dashboards',
          'Production cutover with blue-green deployment strategy',
        ],
        key_milestones: [
          'Load test: < 200ms p95 latency at peak load',
          'DR tested: RPO < 5min, RTO < 30min',
          'Production live on Azure with zero downtime cutover',
        ],
      },
    ],
  },
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORT 2 — TechCorp Legacy CRM (On-Premises → Azure)
// ═════════════════════════════════════════════════════════════════════════════
export const DEMO_REPORT_TECHCORP: AnalysisReport = {
  session_id: DEMO_SESSION_IDS.techcorp,
  project_name: 'TechCorp Legacy CRM',
  source_cloud: 'on-premises',
  target_cloud: 'azure',
  status: 'completed',
  created_at: hoursAgo(18),
  agent_results: makeAgentResults([34.1, 28.7, 25.3, 42.6, 31.9, 27.4]),
  synthesis: {
    executive_summary:
      'The TechCorp Legacy CRM is a monolithic .NET Framework 4.8 application running on Windows Server 2019 with SQL Server 2017 on-premises. ' +
      'The application serves 2,400 daily active users across 3 business units with a complex stored procedure layer (340+ procedures). ' +
      'We recommend a phased Modernize strategy: first containerize the monolith to Azure App Service, then incrementally extract microservices for high-value domains (Sales Pipeline, Customer 360, Reporting). ' +
      'The SQL Server workload is an ideal candidate for Azure SQL Managed Instance with Azure Hybrid Benefit, saving 55% on database licensing alone. ' +
      'Expected total savings: $8,100/month with improved availability (99.95% SLA vs current ~99.5%).',
    maturity_score: 2.1,
    recommended_strategy: 'Modernize — Containerize monolith first, then incrementally extract microservices for key domains',
    estimated_migration_duration_weeks: 32,
    estimated_cost_savings_monthly_usd: 8100,
    key_findings: [
      '.NET Framework 4.8 monolith — requires upgrade path to .NET 8 for containerization',
      'SQL Server 2017 with 340+ stored procedures — Azure SQL Managed Instance is optimal target',
      'Windows Authentication (Kerberos) — needs migration to Azure AD with hybrid identity',
      'SSRS reporting (47 reports) — migrate to Power BI Embedded or Paginated Reports',
      'File shares for document storage (2.3TB) — migrate to Azure Blob Storage with Azure File Sync',
      'No CI/CD pipeline — manual deployment via RDP and XCOPY (high risk)',
      'Zero automated tests — requires investment in test harness before migration',
      'Active Directory Group Policy dependencies — map to Azure AD Conditional Access',
    ],
    critical_risks: [
      'Zero test coverage means regression risk is very high during .NET upgrade — invest in characterization tests first',
      '340 stored procedures with business logic — must audit for SQL Server-specific syntax incompatible with Azure SQL MI',
      'Kerberos-based Windows Authentication will not work in cloud — Azure AD migration is prerequisite',
      'SSRS reports with complex drill-through chains — Power BI migration requires report-by-report validation',
      'Custom COM components in the application — need .NET interop replacement or containerization workaround',
    ],
    top_10_actions: [
      { priority: 1, action: 'Create characterization test suite for critical business flows (Sales, Billing, Customer Management)', owner: 'QA Team', timeline: 'Week 1-4', effort: 'High', impact: 'critical' },
      { priority: 2, action: 'Audit all 340 stored procedures for Azure SQL MI compatibility using DMA (Data Migration Assistant)', owner: 'Database Team', timeline: 'Week 1-3', effort: 'Medium', impact: 'critical' },
      { priority: 3, action: 'Upgrade from .NET Framework 4.8 to .NET 8 using .NET Upgrade Assistant', owner: 'Dev Team', timeline: 'Week 4-10', effort: 'High', impact: 'critical' },
      { priority: 4, action: 'Deploy Azure AD Connect for hybrid identity and migrate from Kerberos to modern auth', owner: 'Identity Team', timeline: 'Week 4-8', effort: 'High', impact: 'critical' },
      { priority: 5, action: 'Provision Azure SQL Managed Instance with Azure Hybrid Benefit and migrate databases via DMS', owner: 'Database Team', timeline: 'Week 8-12', effort: 'High', impact: 'high' },
      { priority: 6, action: 'Containerize the CRM monolith and deploy to Azure App Service with staging slots', owner: 'Dev Team', timeline: 'Week 12-16', effort: 'High', impact: 'high' },
      { priority: 7, action: 'Migrate SSRS reports to Power BI Embedded with paginated reports for complex layouts', owner: 'BI Team', timeline: 'Week 12-18', effort: 'High', impact: 'medium' },
      { priority: 8, action: 'Set up Azure DevOps CI/CD pipelines with automated build, test, and deployment', owner: 'DevOps Team', timeline: 'Week 14-16', effort: 'Medium', impact: 'high' },
      { priority: 9, action: 'Migrate file shares to Azure Blob Storage with Azure File Sync for hybrid access period', owner: 'Infra Team', timeline: 'Week 16-20', effort: 'Medium', impact: 'medium' },
      { priority: 10, action: 'Extract Sales Pipeline domain as first microservice on Azure Container Apps', owner: 'Dev Team', timeline: 'Week 24-32', effort: 'High', impact: 'medium' },
    ],
    roadmap_phases: [
      {
        phase: 1,
        name: 'Assessment & Test Harness',
        duration_weeks: 6,
        objectives: [
          'Build characterization test suite for top 20 business flows',
          'Complete SQL compatibility audit with Data Migration Assistant',
          'Deploy Azure AD Connect and validate hybrid identity',
          'Establish Azure Landing Zone with ExpressRoute connectivity',
        ],
        key_milestones: ['Test harness covering 80% of critical paths', 'SQL MI compatibility report completed', 'Azure AD hybrid identity validated'],
      },
      {
        phase: 2,
        name: '.NET Modernization & DB Migration',
        duration_weeks: 10,
        objectives: [
          'Upgrade application from .NET Framework 4.8 to .NET 8',
          'Migrate SQL Server to Azure SQL Managed Instance',
          'Replace Windows Auth with Azure AD / MSAL authentication',
          'Set up CI/CD pipelines in Azure DevOps',
        ],
        key_milestones: ['.NET 8 upgrade complete, all tests passing', 'Database migration with < 2hr downtime', 'First automated deployment to staging'],
      },
      {
        phase: 3,
        name: 'Cloud Deployment & Reporting',
        duration_weeks: 8,
        objectives: [
          'Deploy containerized CRM to Azure App Service',
          'Migrate SSRS reports to Power BI Embedded',
          'Migrate file shares to Azure Blob Storage',
          'Implement Azure Monitor and Application Insights',
        ],
        key_milestones: ['CRM running on Azure App Service in production', '47 SSRS reports migrated to Power BI', 'Full observability with dashboards and alerts'],
      },
      {
        phase: 4,
        name: 'Microservice Extraction & Optimization',
        duration_weeks: 8,
        objectives: [
          'Extract Sales Pipeline as independent microservice',
          'Implement Azure API Management for service mesh',
          'Optimize costs with Reserved Instances and right-sizing',
          'Decommission on-premises infrastructure',
        ],
        key_milestones: ['Sales Pipeline microservice live in production', 'On-premises servers decommissioned', 'Monthly Azure cost within budget target'],
      },
    ],
  },
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORT 3 — FinServ Trading API (Azure Cost Optimization)
// ═════════════════════════════════════════════════════════════════════════════
export const DEMO_REPORT_FINSERV: AnalysisReport = {
  session_id: DEMO_SESSION_IDS.finserv,
  project_name: 'FinServ Trading API',
  source_cloud: 'azure',
  target_cloud: 'azure',
  status: 'completed',
  created_at: hoursAgo(48),
  agent_results: makeAgentResults([18.2, 15.6, 38.4, 12.1, 22.3, 33.8]),
  synthesis: {
    executive_summary:
      'The FinServ Trading API is a high-performance, event-driven system on Azure processing 2.8M transactions/day. ' +
      'The architecture uses AKS (12 nodes), Azure SQL Hyperscale, Event Hubs (Premium), and Azure Cache for Redis Enterprise. ' +
      'Current monthly spend is $47,300. Our analysis identified $12,800/month in optimization opportunities (27% reduction) without impacting performance SLAs. ' +
      'Key savings: AKS node right-sizing ($4,200), SQL Hyperscale reserved capacity ($3,600), Event Hubs tier optimization ($2,100), and orphaned resource cleanup ($2,900). ' +
      'The WAF review scores the architecture at 4.1/5 with recommendations to improve the Reliability pillar (currently 3.6) through multi-region active-passive failover.',
    maturity_score: 4.1,
    recommended_strategy: 'Optimize — Right-size existing resources and implement reserved capacity without architectural changes',
    estimated_migration_duration_weeks: 8,
    estimated_cost_savings_monthly_usd: 12800,
    key_findings: [
      'AKS cluster over-provisioned: 12 D8s_v5 nodes averaging 34% CPU — right-size to 8 D4s_v5 nodes with KEDA autoscaler',
      'Azure SQL Hyperscale (Gen5, 16 vCores) — 3-year reserved capacity saves 48% ($3,600/mo)',
      'Event Hubs Premium with 4 TUs — downgrade to Standard with 8 TUs for same throughput at 40% less cost',
      '17 orphaned disks, 4 unused Public IPs, 2 idle Load Balancers — $2,900/mo wasted',
      'Redis Enterprise E10 with 62% memory headroom — downsize to E5 tier',
      'Application Insights sampling at 100% ingestion — reduce to adaptive sampling (30% cost reduction on logs)',
      'WAF Reliability: 3.6/5 — no multi-region failover, single point of failure in primary region',
      'WAF Security: 4.4/5 — strong with Private Endpoints, but missing Key Vault certificate rotation automation',
      'WAF Performance: 4.5/5 — excellent p99 latency (< 45ms) with Redis caching layer',
    ],
    critical_risks: [
      'Single-region deployment (West Europe) — any regional outage causes full service disruption for trading operations',
      'AKS right-sizing must be validated with load testing during market hours to avoid latency regression',
      'Event Hubs tier change requires consumer group recreation and brief message processing pause',
      'SQL reserved capacity is a 3-year commitment — ensure workload stability before purchasing',
    ],
    top_10_actions: [
      { priority: 1, action: 'Delete 17 orphaned disks, 4 unused Public IPs, and 2 idle Load Balancers (immediate savings)', owner: 'Infra Team', timeline: 'Week 1', effort: 'Low', impact: 'high' },
      { priority: 2, action: 'Right-size AKS from 12x D8s_v5 to 8x D4s_v5 with KEDA HTTP autoscaler for burst capacity', owner: 'Platform Team', timeline: 'Week 1-3', effort: 'Medium', impact: 'high' },
      { priority: 3, action: 'Purchase Azure SQL Hyperscale 3-year reserved capacity (16 vCores, Gen5)', owner: 'FinOps Team', timeline: 'Week 2', effort: 'Low', impact: 'high' },
      { priority: 4, action: 'Migrate Event Hubs from Premium (4 TU) to Standard (8 TU) with partition key optimization', owner: 'Backend Team', timeline: 'Week 3-4', effort: 'Medium', impact: 'medium' },
      { priority: 5, action: 'Downsize Redis Enterprise from E10 to E5 tier after validating memory usage patterns', owner: 'Platform Team', timeline: 'Week 4-5', effort: 'Low', impact: 'medium' },
      { priority: 6, action: 'Configure Application Insights adaptive sampling to reduce log ingestion costs by 30%', owner: 'DevOps Team', timeline: 'Week 3', effort: 'Low', impact: 'medium' },
      { priority: 7, action: 'Implement Azure Advisor recommendations for remaining low-hanging fruit optimizations', owner: 'FinOps Team', timeline: 'Week 4-5', effort: 'Low', impact: 'low' },
      { priority: 8, action: 'Deploy secondary region (North Europe) with AKS and SQL Hyperscale geo-replication for DR', owner: 'Platform Team', timeline: 'Week 5-8', effort: 'High', impact: 'critical' },
      { priority: 9, action: 'Automate Key Vault certificate rotation with Event Grid and Azure Functions', owner: 'Security Team', timeline: 'Week 6-7', effort: 'Medium', impact: 'medium' },
      { priority: 10, action: 'Set up Azure Cost Management budgets, alerts, and monthly FinOps review cadence', owner: 'FinOps Team', timeline: 'Week 2-3', effort: 'Low', impact: 'medium' },
    ],
    roadmap_phases: [
      {
        phase: 1,
        name: 'Quick Wins & Cleanup',
        duration_weeks: 2,
        objectives: [
          'Delete all orphaned and unused resources',
          'Purchase SQL reserved capacity',
          'Set up Cost Management alerts and budgets',
          'Configure Application Insights adaptive sampling',
        ],
        key_milestones: ['$5,800/mo savings realized from cleanup + reservations', 'FinOps dashboards live'],
      },
      {
        phase: 2,
        name: 'Compute Right-Sizing',
        duration_weeks: 3,
        objectives: [
          'Right-size AKS nodes with KEDA autoscaler',
          'Migrate Event Hubs to Standard tier',
          'Downsize Redis Enterprise tier',
          'Load test all changes during market hours',
        ],
        key_milestones: ['AKS right-sizing validated under production load', 'Additional $7,000/mo savings confirmed'],
      },
      {
        phase: 3,
        name: 'Reliability & DR',
        duration_weeks: 3,
        objectives: [
          'Deploy secondary region with geo-replication',
          'Implement Traffic Manager for failover routing',
          'Automate certificate rotation',
          'Update runbooks for multi-region operations',
        ],
        key_milestones: ['DR failover tested: RTO < 5min', 'WAF Reliability score improved from 3.6 to 4.3'],
      },
    ],
  },
}

// ─── Lookup map ──────────────────────────────────────────────────────────────
export const DEMO_REPORTS: Record<string, AnalysisReport> = {
  [DEMO_SESSION_IDS.contoso]: DEMO_REPORT_CONTOSO,
  [DEMO_SESSION_IDS.techcorp]: DEMO_REPORT_TECHCORP,
  [DEMO_SESSION_IDS.finserv]: DEMO_REPORT_FINSERV,
}
