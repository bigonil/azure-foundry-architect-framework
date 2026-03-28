import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export interface ArtifactItem {
  filename: string
  content: string
}

export interface AnalysisRequest {
  project_name: string
  source_cloud: 'aws' | 'azure' | 'gcp' | 'on-premises' | 'hybrid'
  target_cloud: 'azure'
  analysis_types: string[]
  code_artifacts: ArtifactItem[]
  iac_artifacts: ArtifactItem[]
  current_monthly_cost_usd?: number
  additional_context?: string
  use_foundry_mode?: boolean
}

export interface AgentResultSummary {
  agent_name: string
  status: 'success' | 'partial' | 'failed'
  duration_seconds: number
  error?: string
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
  }
  agent_results: Record<string, AgentResultSummary>
  created_at: number
}

export interface SessionStatus {
  session_id: string
  status: 'running' | 'completed' | 'failed'
  project_name?: string
  elapsed_seconds: number
  error?: string
}

export const analysisApi = {
  start: (request: AnalysisRequest) =>
    api.post<{ session_id: string; status: string; message: string }>('/analysis/start', request),

  quickScan: (request: AnalysisRequest) =>
    api.post<AnalysisReport>('/analysis/quick-scan', request),

  getReport: (sessionId: string) =>
    api.get<AnalysisReport>(`/analysis/${sessionId}`),

  getStatus: (sessionId: string) =>
    api.get<SessionStatus>(`/analysis/${sessionId}/status`),

  listSessions: () =>
    api.get<SessionStatus[]>('/analysis/'),
}
