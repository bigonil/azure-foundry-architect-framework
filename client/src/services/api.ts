import axios from 'axios'
import { mockAnalysisApi } from './mockApi'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export interface ArtifactItem {
  filename: string
  content: string
}

// ── Source config types (mirror backend discriminated union) ─────────────────

// ── Presign ──────────────────────────────────────────────────────────────────

export interface PresignRequest {
  filename: string
  artifact_type: 'code' | 'iac'
}

export interface PresignResponse {
  key: string
  upload_url: string
  method: 'PUT'
  expires_in: number
}

export interface BlobArtifactRef {
  key: string
  filename: string
  artifact_type: 'code' | 'iac'
}

export interface BlobSourceConfig {
  type: 'blob'
  artifacts: BlobArtifactRef[]
}

export interface VolumeSourceConfig {
  type: 'volume'
  code_folder: string
  iac_folder: string
}

export interface GitHubSourceConfig {
  type: 'github'
  repo_url: string
  branch: string
  token?: string
  code_folder: string
  iac_folder: string
}

export interface DevOpsSourceConfig {
  type: 'devops'
  org_url: string
  project: string
  repo: string
  branch: string
  token: string
  code_folder: string
  iac_folder: string
}

export type SourceConfig = BlobSourceConfig | VolumeSourceConfig | GitHubSourceConfig | DevOpsSourceConfig

export interface McpServerConfig {
  id: string
  name: string
  type: 'url' | 'stdio'
  url?: string
  enabled: boolean
  cloud: string
  /** Server URL is managed server-side (internal Docker service). UI shows toggle only. */
  preconfigured?: boolean
  /** Bearer token for authenticated MCP servers (passed via Anthropic MCP beta). */
  authorization_token?: string
}

export interface AnalysisRequest {
  project_name: string
  source_cloud: 'aws' | 'azure' | 'gcp' | 'on-premises' | 'hybrid'
  target_cloud: 'azure'
  analysis_types: string[]
  code_artifacts: ArtifactItem[]
  iac_artifacts: ArtifactItem[]
  source_config?: SourceConfig
  current_monthly_cost_usd?: number
  additional_context?: string
  use_foundry_mode?: boolean
  mcp_servers?: McpServerConfig[]
}

export interface CodeAnalyzerData {
  technology_inventory?: {
    languages?: string[]
    frameworks?: string[]
    build_tools?: string[]
    test_frameworks?: string[]
    package_managers?: string[]
  }
  cloud_coupling?: {
    sdks_detected?: string[]
    services_referenced?: string[]
    coupling_level?: string
    migration_blockers?: string[]
  }
  architecture_patterns?: {
    type?: string
    patterns?: string[]
    entry_points?: string[]
    key_modules?: string[]
  }
  technical_debt?: {
    estimated_days?: number
    areas?: string[]
    severity?: string
  }
  containerization_readiness?: {
    score?: string
    blockers?: string[]
    recommendations?: string[]
  }
  migration_impact?: {
    code_changes_required?: string[]
    config_changes?: string[]
    estimated_effort_days?: number
  }
  coupling_score?: string
  summary?: string
}

export interface QualityAnalyzerData {
  quality_gate?: { status?: string; passed?: boolean }
  summary?: {
    bugs?: number
    vulnerabilities?: number
    code_smells?: number
    security_hotspots?: number
    technical_debt?: string
    coverage?: number
    duplications?: number
    reliability_rating?: string
    security_rating?: string
    maintainability_rating?: string
  }
  issues?: Array<{
    type?: string
    severity?: string
    message?: string
    component?: string
    line?: number
  }>
  top_recommendations?: string[]
  coverage_by_module?: any[]
  total_issues?: number
  reliability_rating?: string
  security_rating?: string
  maintainability_rating?: string
  parse_error?: boolean
}

export interface AgentResultSummary {
  agent_name: string
  status: 'success' | 'partial' | 'failed' | 'skipped'
  duration_seconds: number
  error?: string
  input_tokens?: number
  output_tokens?: number
  cost_eur?: number
  data?: McpEnrichmentData | CodeAnalyzerData | QualityAnalyzerData
}

export interface McpServiceMapping {
  source_service: string
  source_tier?: string
  azure_target: string
  azure_sku?: string
  migration_approach?: string
  estimated_monthly_eur?: number
  migration_complexity?: string
  migration_steps?: string[]
  azure_docs_url?: string
}

export interface McpInfraRecommendation {
  area: string
  priority: string
  recommendation: string
  rationale?: string
  effort?: string
}

export interface McpMigrationPhase {
  phase: number
  name: string
  duration_weeks: number
  services_to_migrate?: string[]
  key_activities?: string[]
  risks?: string[]
  dependencies?: string[]
}

export interface McpEnrichmentData {
  migration_readiness?: {
    overall_score?: string | number
    suitability?: string
    blockers?: string[]
    recommendations?: string[]
    dependencies_detected?: string[]
    estimated_migration_effort_weeks?: number
  }
  azure_migrate_raw?: string
  aws_to_azure_service_mapping?: McpServiceMapping[]
  azure_pricing_estimate?: {
    monthly_eur?: number
    current_monthly_eur?: number
    savings_pct?: number
    breakdown?: Array<{ service: string; sku?: string; quantity?: string; monthly_eur?: number; notes?: string }>
    cost_optimization_tips?: string[]
    assumptions?: string[]
  }
  advisor_recommendations?: Array<{
    category?: string
    severity?: string
    recommendation?: string
    impact?: string
    implementation_steps?: string[]
  }>
  waf_assessment?: Record<string, { score?: number; findings?: string[]; recommendations?: string[] }>
  reference_architectures?: Array<{ name?: string; url?: string; fit_score?: number; description?: string; key_components?: string[] }>
  service_guidance?: Record<string, { sku_recommendation?: string; sizing_notes?: string; migration_notes?: string; configuration_tips?: string[]; docs_url?: string; estimated_monthly_eur?: number }>
  infrastructure_recommendations?: McpInfraRecommendation[]
  migration_path?: {
    recommended_approach?: string
    rationale?: string
    phases?: McpMigrationPhase[]
    critical_path_items?: string[]
    quick_wins?: string[]
  }
  best_practices?: string[]
  devops_context?: { projects?: any[]; repos?: any[]; pipelines?: any[]; work_items?: any[]; ci_cd_maturity?: string; migration_items_found?: number }
  azure_skills_called?: string[]
  enrichment_quality?: string
  enrichment_notes?: string
  parse_error?: boolean
  raw_text?: string
}

export interface AnalysisReport {
  session_id: string
  project_name: string
  source_cloud: string
  target_cloud: string
  status: string
  synthesis: {
    executive_summary?: string
    maturity_score?: number
    key_findings?: string[]
    critical_risks?: string[]
    recommended_strategy?: string
    estimated_migration_duration_weeks?: number
    estimated_cost_savings_monthly_usd?: number
    top_10_actions?: Array<{
      priority: number
      action: string
      owner: string
      timeline: string
      effort: string
      impact: string
    }>
    roadmap_phases?: Array<{
      phase: number
      name: string
      duration_weeks: number
      objectives: string[]
      key_milestones: string[]
    }>
    effort_detail?: Record<string, unknown>
    app_recommendations?: Array<{
      category?: string
      priority?: string
      recommendation?: string
      rationale?: string
      effort?: string
      standard?: string
    }>
    infra_recommendations?: Array<{
      category?: string
      priority?: string
      recommendation?: string
      rationale?: string
      effort?: string
    }>
    app_migration_checklist?: Array<{
      item?: string
      status?: string
      category?: string
      effort?: string
    }>
  }
  agent_results: Record<string, AgentResultSummary>
  created_at: number
  total_input_tokens?: number
  total_output_tokens?: number
  total_cost_eur?: number
  sonarqube_analysis?: {
    project_key?: string
    project_name?: string
    project_url?: string
    error?: string
    quality_gate?: {
      status: string  // OK | ERROR | WARN | NONE
      conditions?: Array<{ metric: string; status: string; actual?: string; threshold?: string }>
    }
    measures?: {
      bugs?: number
      vulnerabilities?: number
      code_smells?: number
      security_hotspots?: number
      coverage?: number
      duplication_pct?: number
      technical_debt?: string
      technical_debt_minutes?: number
      ncloc?: number
      reliability_rating?: string
      security_rating?: string
      sqale_rating?: string
    }
    issues?: Array<{
      key: string
      type: string
      severity: string
      message: string
      component: string
      line?: number
    }>
  }
}

export interface SessionStatus {
  session_id: string
  status: 'running' | 'completed' | 'failed'
  project_name?: string
  elapsed_seconds: number
  error?: string
}

// ── Demo mode detection ──────────────────────────────────────────────────────
// Active when VITE_DEMO_MODE=true OR when no backend is reachable
let _demoMode: boolean | null = null

async function isDemoMode(): Promise<boolean> {
  // Explicit env var takes priority
  if (import.meta.env.VITE_DEMO_MODE === 'true') return true
  if (import.meta.env.VITE_DEMO_MODE === 'false') return false

  // Auto-detect: try to reach the backend health endpoint
  if (_demoMode === null) {
    try {
      await axios.get('/health', { timeout: 2000 })
      _demoMode = false
    } catch {
      _demoMode = true
    }
  }
  return _demoMode
}

// ── Demo mode check (exported for use in pages) ──────────────────────────────
export { isDemoMode }

// ── Artifacts API (presign + direct upload) ──────────────────────────────────
export const artifactsApi = {
  /** Request a presigned PUT URL for a single file. */
  presign: (body: PresignRequest) =>
    api.post<PresignResponse>('/artifacts/presign', body),

  /**
   * Upload a File directly to the presigned URL (MinIO / Azure Blob).
   * This call goes directly to the storage endpoint — NOT through the backend.
   */
  uploadDirect: async (uploadUrl: string, file: File): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    if (!res.ok) throw new Error(`Direct upload failed: ${res.status} ${res.statusText}`)
  },

  /** Delete an artifact by its storage key. */
  delete: (key: string) =>
    api.delete(`/artifacts/${encodeURIComponent(key)}`),

  /**
   * Upload files to the Docker volume (/app/uploads) for persistent reuse.
   * Returns saved paths and the folder keys for the "Local Volume" tab.
   */
  uploadToVolume: async (
    files: File[],
    artifactType: 'code' | 'iac',
    subfolder: string = '',
  ) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('artifact_type', artifactType)
    if (subfolder) form.append('subfolder', subfolder)
    return api.post<{
      saved: Array<{ filename: string; path: string; artifact_type: string; size_bytes: number }>
      skipped: string[]
      volume_code_folder: string
      volume_iac_folder: string
    }>('/artifacts/upload-to-volume', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// ── Public API (auto-routes to mock or real) ─────────────────────────────────
export const analysisApi = {
  /**
   * Start an analysis.
   * - Demo mode  → returns a fake full report immediately (mock)
   * - Real mode  → starts async analysis, returns { session_id } for polling
   */
  start: async (request: AnalysisRequest) => {
    if (await isDemoMode()) return mockAnalysisApi.start(request)
    return api.post<{ session_id: string; status: string; message: string }>('/analysis/start', request)
  },

  /**
   * Quick scan (demo mode only — real mode uses start() + polling via ReportPage).
   */
  quickScan: async (request: AnalysisRequest) => {
    if (await isDemoMode()) return mockAnalysisApi.quickScan(request)
    // Real backend: delegate to async start; caller must navigate to /report/:id
    return api.post<{ session_id: string; status: string; message: string }>('/analysis/start', request)
  },

  getReport: async (sessionId: string) => {
    if (sessionId.startsWith('demo-') || await isDemoMode()) return mockAnalysisApi.getReport(sessionId)
    return api.get<AnalysisReport>(`/analysis/${sessionId}`)
  },

  getStatus: async (sessionId: string) => {
    if (sessionId.startsWith('demo-') || await isDemoMode()) return mockAnalysisApi.getStatus(sessionId)
    return api.get<SessionStatus>(`/analysis/${sessionId}/status`)
  },

  listSessions: async () => {
    if (await isDemoMode()) return mockAnalysisApi.listSessions()
    return api.get<SessionStatus[]>('/analysis/')
  },
}
