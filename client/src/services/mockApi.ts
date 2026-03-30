/**
 * Mock API — simulates backend responses for demo mode.
 * Activated when VITE_DEMO_MODE=true or no backend is available.
 */
import type { AnalysisRequest, AnalysisReport, SessionStatus } from './api'
import { DEMO_SESSIONS, DEMO_REPORTS, DEMO_SESSION_IDS, DEMO_REPORT_CONTOSO } from './mockData'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Simulates agent-by-agent execution with realistic delays. */
async function simulateAnalysis(request: AnalysisRequest): Promise<AnalysisReport> {
  // Small delay to simulate network + processing
  await sleep(1500)

  // For the demo we always return the Contoso report, adapted to the user's input
  const report: AnalysisReport = {
    ...DEMO_REPORT_CONTOSO,
    session_id: `demo-${Date.now()}`,
    project_name: request.project_name || 'Demo Project',
    source_cloud: request.source_cloud,
    target_cloud: request.target_cloud,
    created_at: Date.now() / 1000,
  }

  return report
}

export const mockAnalysisApi = {
  start: async (request: AnalysisRequest) => {
    const sessionId = `demo-${Date.now()}`
    // Store a pending report in sessionStorage so getReport can find it
    const report = await simulateAnalysis({ ...request })
    report.session_id = sessionId
    sessionStorage.setItem(`demo-report-${sessionId}`, JSON.stringify(report))

    return {
      data: {
        session_id: sessionId,
        status: 'running',
        message: `Analysis started. Poll /api/analysis/${sessionId} for results.`,
      },
    }
  },

  quickScan: async (request: AnalysisRequest) => {
    const report = await simulateAnalysis(request)
    return { data: report }
  },

  getReport: async (sessionId: string) => {
    await sleep(400)

    // Check pre-built demo reports
    if (DEMO_REPORTS[sessionId]) {
      return { data: DEMO_REPORTS[sessionId] }
    }

    // Check sessionStorage for dynamically created reports
    const stored = sessionStorage.getItem(`demo-report-${sessionId}`)
    if (stored) {
      return { data: JSON.parse(stored) as AnalysisReport }
    }

    // Fallback: return Contoso report with the requested sessionId
    return { data: { ...DEMO_REPORT_CONTOSO, session_id: sessionId } }
  },

  getStatus: async (sessionId: string) => {
    await sleep(300)
    return {
      data: {
        session_id: sessionId,
        status: 'completed' as const,
        project_name: DEMO_REPORTS[sessionId]?.project_name ?? 'Demo Project',
        elapsed_seconds: 187,
      },
    }
  },

  listSessions: async () => {
    await sleep(300)

    // Include pre-built sessions + any from sessionStorage
    const dynamic: SessionStatus[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('demo-report-')) {
        try {
          const report = JSON.parse(sessionStorage.getItem(key)!) as AnalysisReport
          dynamic.push({
            session_id: report.session_id,
            status: 'completed',
            project_name: report.project_name,
            elapsed_seconds: 187,
          })
        } catch { /* ignore */ }
      }
    }

    return { data: [...dynamic, ...DEMO_SESSIONS] }
  },
}
