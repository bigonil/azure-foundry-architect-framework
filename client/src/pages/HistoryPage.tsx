import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import { analysisApi } from '../services/api'

export default function HistoryPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data } = await analysisApi.listSessions()
      return data
    },
    refetchInterval: 10_000,
  })

  if (isLoading) return <div className="text-gray-400">Loading sessions...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Analysis History</h1>

      {!sessions || sessions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>No analyses yet.</p>
          <Link to="/analysis" className="text-blue-400 hover:underline mt-2 inline-block">
            Start your first analysis →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link
              key={session.session_id}
              to={`/report/${session.session_id}`}
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
                  <div className="font-medium text-white">{session.project_name ?? 'Unnamed Project'}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {session.session_id.slice(0, 8)}...
                    {session.elapsed_seconds && ` · ${session.elapsed_seconds.toFixed(0)}s`}
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
          ))}
        </div>
      )}
    </div>
  )
}
