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
    if (await isDemoMode()) return mockAnalysisApi.getReport(sessionId)
    return api.get<AnalysisReport>(`/analysis/${sessionId}`)
  },

  getStatus: async (sessionId: string) => {
    if (await isDemoMode()) return mockAnalysisApi.getStatus(sessionId)
    return api.get<SessionStatus>(`/analysis/${sessionId}/status`)
  },

  listSessions: async () => {
    if (await isDemoMode()) return mockAnalysisApi.listSessions()
    return api.get<SessionStatus[]>('/analysis/')
  },
}
