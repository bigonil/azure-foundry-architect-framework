import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Clock, CheckCircle2, XCircle, ChevronRight, Zap, FileCode } from 'lucide-react'
import { analysisApi, performanceApi } from '../services/api'

export default function HistoryPage() {
  // Fetch both analysis and performance sessions
  const { data: analysisSessions, isLoading: loadingAnalysis } = useQuery({
    queryKey: ['analysis-sessions'],
    queryFn: async () => {
      const { data } = await analysisApi.listSessions()
      return data.map(s => ({ ...s, type: 'analysis' }))
    },
    refetchInterval: 10_000,
  })

  const { data: performanceSessions, isLoading: loadingPerformance } = useQuery({
    queryKey: ['performance-sessions'],
    queryFn: async () => {
      const { data } = await performanceApi.listSessions()
      return data.map(s => ({ ...s, type: 'performance' }))
    },
    refetchInterval: 10_000,
  })

  const isLoading = loadingAnalysis || loadingPerformance
  
  // Combine and sort sessions by started_at
  const allSessions = [
    ...(analysisSessions || []),
    ...(performanceSessions || []),
  ].sort((a, b) => (b.started_at || 0) - (a.started_at || 0))

  if (isLoading) return <div className="text-gray-400">Loading sessions...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analysis History</h1>
        <p className="text-gray-400 mt-1 text-sm">All past and in-progress analysis sessions.</p>
      </div>

      {!allSessions || allSessions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>No analyses yet.</p>
          <Link to="/analysis" className="text-blue-400 hover:underline mt-2 inline-block">
            Start your first analysis →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {allSessions.map((session) => {
            const isPerformance = session.type === 'performance'
            const linkTo = isPerformance 
              ? `/performance/report/${session.session_id}` 
              : `/report/${session.session_id}`
            
            return (
              <Link
                key={session.session_id}
                to={linkTo}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  {session.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : session.status === 'failed' ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-400 animate-pulse" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{session.project_name ?? 'Unnamed Project'}</span>
                      {isPerformance ? (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
                          <Zap className="w-3 h-3" />
                          Performance
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400">
                          <FileCode className="w-3 h-3" />
                          Architecture
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {session.session_id.slice(0, 24)}
                      {session.elapsed_seconds != null && ` · ${Math.round(session.elapsed_seconds)}s`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      'text-xs px-2.5 py-1 rounded-full border font-medium',
                      session.status === 'completed'
                        ? 'text-green-400 bg-green-500/10 border-green-500/30'
                        : session.status === 'failed'
                        ? 'text-red-400 bg-red-500/10 border-red-500/30'
                        : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
                    )}
                  >
                    {session.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
