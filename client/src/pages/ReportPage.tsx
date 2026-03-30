import { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, TrendingDown,
  ChevronRight, Shield, ShieldCheck, Server, Code2, DollarSign, GitBranch,
  BarChart3, Star, Loader2,
} from 'lucide-react'
import { analysisApi, type AnalysisReport } from '../services/api'

const WAF_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  low: 'text-green-400 bg-green-500/10 border-green-500/30',
}

const IMPACT_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
}

const AGENT_ICONS: Record<string, any> = {
  code_analyzer: Code2,
  infra_analyzer: Server,
  cost_optimizer: DollarSign,
  migration_planner: GitBranch,
  gap_analyzer: BarChart3,
  waf_reviewer: Shield,
  quality_analyzer: ShieldCheck,
}

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const location = useLocation()
  const [pollingEnabled, setPollingEnabled] = useState(true)

  // If report was passed via navigation state (quick scan), use it directly
  const preloadedReport = location.state?.report as AnalysisReport | undefined

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', sessionId],
    queryFn: async () => {
      if (preloadedReport) return preloadedReport
      const { data } = await analysisApi.getReport(sessionId!)
      return data
    },
    refetchInterval: pollingEnabled ? 3000 : false,
    enabled: !!sessionId,
  })

  useEffect(() => {
    if (report?.status === 'completed' || report?.status === 'failed') {
      setPollingEnabled(false)
    }
  }, [report])

  if (isLoading && !preloadedReport) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-700 rounded-full" />
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full absolute top-0 animate-spin" />
        </div>
        <div className="text-gray-400">Running multi-agent analysis...</div>
        <div className="text-xs text-gray-600">This may take a few minutes</div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex items-center gap-3 bg-red-900/20 border border-red-800 rounded-xl p-6">
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
        <div>
          <div className="text-red-300 font-medium">Failed to load report</div>
          <div className="text-red-400/70 text-sm mt-1">Session ID: {sessionId}</div>
        </div>
      </div>
    )
  }

  const synthesis = report.synthesis
  const maturityScore = synthesis.maturity_score ?? 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{report.project_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-gray-400">
              {report.source_cloud.toUpperCase()} → {report.target_cloud.toUpperCase()}
            </span>
            <span className="text-gray-600">•</span>
            <span className={clsx(
              'text-xs px-2.5 py-1 rounded-full font-medium border',
              report.status === 'completed'
                ? 'text-green-400 bg-green-500/10 border-green-500/30'
                : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
            )}>
              {report.status}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-3xl font-bold text-white">{maturityScore.toFixed(1)}<span className="text-gray-500 text-lg">/5</span></div>
          <div className="text-xs text-gray-500 mt-1">Maturity Score</div>
        </div>
      </div>

      {/* Agent Status Bar */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Agent Results</div>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(report.agent_results).map(([name, result]) => {
            const Icon = AGENT_ICONS[name] ?? CheckCircle2
            return (
              <div
                key={name}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                  result.status === 'success'
                    ? 'border-green-800 bg-green-900/20 text-green-400'
                    : result.status === 'failed'
                    ? 'border-red-800 bg-red-900/20 text-red-400'
                    : 'border-gray-700 bg-gray-800 text-gray-400'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="capitalize">{name.replace('_', ' ')}</span>
                <span className="text-xs opacity-60">{result.duration_seconds.toFixed(1)}s</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Executive Summary */}
      {synthesis.executive_summary && (
        <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-blue-300 uppercase tracking-wider mb-3">Executive Summary</h2>
          <p className="text-gray-300 leading-relaxed">{synthesis.executive_summary}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Recommended Strategy */}
        {synthesis.recommended_strategy && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Strategy</div>
            <div className="text-lg font-bold text-white capitalize">
              {synthesis.recommended_strategy.split('—')[0].trim()}
            </div>
            {synthesis.recommended_strategy.includes('—') && (
              <div className="text-xs text-gray-400 mt-2 leading-relaxed">
                {synthesis.recommended_strategy.split('—')[1].trim()}
              </div>
            )}
          </div>
        )}

        {/* Duration */}
        {synthesis.estimated_migration_duration_weeks && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Migration Timeline</div>
            <div className="text-3xl font-bold text-white">
              {synthesis.estimated_migration_duration_weeks}
              <span className="text-gray-500 text-base font-normal ml-1">weeks</span>
            </div>
          </div>
        )}

        {/* Savings */}
        {synthesis.estimated_cost_savings_monthly_usd && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Monthly Savings</div>
            <div className="text-3xl font-bold text-green-400">
              ${synthesis.estimated_cost_savings_monthly_usd.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              ${(synthesis.estimated_cost_savings_monthly_usd * 12).toLocaleString()}/year
            </div>
          </div>
        )}
      </div>

      {/* Key Findings & Risks */}
      <div className="grid grid-cols-2 gap-6">
        {synthesis.key_findings && synthesis.key_findings.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h3 className="font-semibold text-white mb-4">Key Findings</h3>
            <ul className="space-y-2">
              {synthesis.key_findings.map((finding, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        )}

        {synthesis.critical_risks && synthesis.critical_risks.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h3 className="font-semibold text-white mb-4">Critical Risks</h3>
            <ul className="space-y-2">
              {synthesis.critical_risks.map((risk, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Top 10 Actions */}
      {synthesis.top_10_actions && synthesis.top_10_actions.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="font-semibold text-white mb-5">Recommended Actions</h3>
          <div className="space-y-3">
            {synthesis.top_10_actions.map((action) => (
              <div key={action.priority} className="flex items-start gap-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/40 flex items-center justify-center text-xs font-bold text-blue-400">
                  {action.priority}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{action.action}</div>
                  <div className="flex gap-3 mt-2 flex-wrap">
                    <span className="text-xs text-gray-500">{action.owner}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs text-gray-500">{action.timeline}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs text-gray-500">{action.effort}</span>
                  </div>
                </div>
                <div className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-2', IMPACT_COLORS[action.impact] ?? 'bg-gray-500')} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roadmap */}
      {synthesis.roadmap_phases && synthesis.roadmap_phases.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="font-semibold text-white mb-5">Migration Roadmap</h3>
          <div className="space-y-4">
            {synthesis.roadmap_phases.map((phase, i) => (
              <div key={phase.phase} className="relative">
                {i < synthesis.roadmap_phases!.length - 1 && (
                  <div className="absolute left-4 top-12 bottom-0 w-px bg-gray-700" />
                )}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                    {phase.phase}
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white">{phase.name}</span>
                      <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{phase.duration_weeks}w</span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {phase.objectives?.map((obj, j) => (
                        <li key={j} className="text-sm text-gray-400 flex items-start gap-2">
                          <ChevronRight className="w-3 h-3 mt-1 flex-shrink-0" />
                          {obj}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
