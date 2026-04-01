import { useParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Shield, ShieldCheck, Server, Code2, DollarSign, GitBranch,
  BarChart3, Bug, ExternalLink, Activity,
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

  // If report was passed via navigation state (demo mode), use it directly
  const preloadedReport = location.state?.report as AnalysisReport | undefined

  // ── Step 1: Poll /status every 3s while analysis is running ─────────────
  const { data: statusData, error: statusError } = useQuery({
    queryKey: ['status', sessionId],
    queryFn: async () => {
      const { data } = await analysisApi.getStatus(sessionId!)
      return data
    },
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return !s || s === 'running' ? 3000 : false
    },
    enabled: !!sessionId && !preloadedReport,
  })

  const isRunning = !preloadedReport && (!statusData || statusData.status === 'running')
  const isFailed  = statusData?.status === 'failed'

  // ── Step 2: Fetch report only once status = completed ───────────────────
  const { data: report, isLoading: reportLoading, error: reportError } = useQuery({
    queryKey: ['report', sessionId],
    queryFn: async () => {
      if (preloadedReport) return preloadedReport
      const { data } = await analysisApi.getReport(sessionId!)
      return data
    },
    enabled: !!preloadedReport || (!!sessionId && statusData?.status === 'completed'),
  })

  // ── Loading: still running ───────────────────────────────────────────────
  if (isRunning) {
    const elapsed = statusData?.elapsed_seconds
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-700 rounded-full" />
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full absolute top-0 animate-spin" />
        </div>
        <div className="text-center">
          <div className="text-gray-300 font-medium">Multi-Agent Analysis Running</div>
          <div className="text-gray-500 text-sm mt-1">
            {elapsed != null ? `${Math.round(elapsed)}s elapsed — ` : ''}checking every 3 seconds...
          </div>
        </div>
        <div className="text-xs text-gray-600">Claude claude-opus-4-6 is analyzing your project</div>
      </div>
    )
  }

  // ── Error: analysis failed or network error ──────────────────────────────
  if (isFailed || statusError || reportError) {
    const detail = statusData?.error ?? (reportError as any)?.message ?? 'Unknown error'
    return (
      <div className="flex items-center gap-3 bg-red-900/20 border border-red-800 rounded-xl p-6">
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
        <div>
          <div className="text-red-300 font-medium">Analysis failed</div>
          <div className="text-red-400/70 text-sm mt-1">{detail}</div>
        </div>
      </div>
    )
  }

  // ── Loading: report fetch in flight ─────────────────────────────────────
  if (reportLoading || !report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-700 rounded-full" />
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full absolute top-0 animate-spin" />
        </div>
        <div className="text-gray-400">Loading report...</div>
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
              €{synthesis.estimated_cost_savings_monthly_usd.toLocaleString('it-IT')}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              €{(synthesis.estimated_cost_savings_monthly_usd * 12).toLocaleString('it-IT')}/year
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

      {/* ── SonarCloud Static Analysis ───────────────────────────────────────── */}
      <SonarCloudSection data={report.sonarqube_analysis} />
    </div>
  )
}

// ── SonarCloud section component ─────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  BLOCKER:  'text-red-400 bg-red-500/10 border-red-500/40',
  CRITICAL: 'text-orange-400 bg-orange-500/10 border-orange-500/40',
  MAJOR:    'text-yellow-400 bg-yellow-500/10 border-yellow-500/40',
  MINOR:    'text-gray-400 bg-gray-700/40 border-gray-600/40',
  INFO:     'text-gray-500 bg-gray-800 border-gray-700',
}

const RATING_COLORS: Record<string, string> = {
  A: 'text-green-400 bg-green-500/10 border-green-500/30',
  B: 'text-lime-400 bg-lime-500/10 border-lime-500/30',
  C: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  E: 'text-red-400 bg-red-500/10 border-red-500/30',
}

function RatingBadge({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={clsx(
        'w-9 h-9 rounded-lg border-2 flex items-center justify-center text-base font-bold',
        RATING_COLORS[value] ?? 'text-gray-400 bg-gray-800 border-gray-700'
      )}>
        {value}
      </div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
    </div>
  )
}

function MetricTile({ label, value, unit, color }: {
  label: string; value?: number | string | null; unit?: string; color?: string
}) {
  return (
    <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
      <div className={clsx('text-2xl font-bold', color ?? 'text-white')}>
        {value ?? '—'}{unit && value != null ? <span className="text-sm font-normal text-gray-400 ml-0.5">{unit}</span> : null}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function SonarCloudSection({ data }: { data?: AnalysisReport['sonarqube_analysis'] }) {
  if (!data) return null

  // Project not found or token not configured — show informational notice
  if (data.error) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-400">SonarCloud Static Analysis</h3>
        </div>
        <p className="text-sm text-gray-500">{data.error}</p>
      </div>
    )
  }

  const m = data.measures ?? {}
  const qg = data.quality_gate ?? {}
  const qgOk = qg.status === 'OK'
  const issues = data.issues ?? []

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-white">SonarCloud Static Analysis</h3>
          <span className="text-xs text-gray-500">{data.project_key}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Quality Gate badge */}
          <div className={clsx(
            'flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold',
            qgOk
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          )}>
            {qgOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            Quality Gate: {qg.status ?? 'UNKNOWN'}
          </div>
          {data.project_url && (
            <a
              href={data.project_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in SonarCloud
            </a>
          )}
        </div>
      </div>

      {/* Ratings row */}
      <div className="flex items-center gap-6">
        <RatingBadge label="Reliability" value={m.reliability_rating} />
        <RatingBadge label="Security" value={m.security_rating} />
        <RatingBadge label="Maintain." value={m.sqale_rating} />
        <div className="h-10 w-px bg-gray-700 mx-2" />
        <span className="text-xs text-gray-500">
          A = best &nbsp;·&nbsp; E = worst
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-3">
        <MetricTile
          label="Bugs"
          value={m.bugs}
          color={m.bugs && m.bugs > 0 ? 'text-red-400' : 'text-green-400'}
        />
        <MetricTile
          label="Vulnerabilities"
          value={m.vulnerabilities}
          color={m.vulnerabilities && m.vulnerabilities > 0 ? 'text-orange-400' : 'text-green-400'}
        />
        <MetricTile
          label="Security Hotspots"
          value={m.security_hotspots}
          color={m.security_hotspots && m.security_hotspots > 0 ? 'text-yellow-400' : 'text-green-400'}
        />
        <MetricTile
          label="Code Smells"
          value={m.code_smells}
          color="text-gray-300"
        />
        <MetricTile
          label="Coverage"
          value={m.coverage != null ? `${m.coverage.toFixed(1)}` : null}
          unit="%"
          color={m.coverage != null && m.coverage >= 80 ? 'text-green-400' : 'text-yellow-400'}
        />
        <MetricTile
          label="Duplication"
          value={m.duplication_pct != null ? `${m.duplication_pct.toFixed(1)}` : null}
          unit="%"
          color={m.duplication_pct != null && m.duplication_pct <= 3 ? 'text-green-400' : 'text-yellow-400'}
        />
        <MetricTile label="Technical Debt" value={m.technical_debt} color="text-blue-400" />
        <MetricTile
          label="Lines of Code"
          value={m.ncloc != null ? m.ncloc.toLocaleString('it-IT') : null}
          color="text-gray-300"
        />
      </div>

      {/* Failing quality gate conditions */}
      {qg.conditions && qg.conditions.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Failing Conditions</div>
          <div className="space-y-1">
            {qg.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <span className="font-mono text-xs text-red-400">{c.metric}</span>
                <span className="text-gray-400">actual: <strong>{c.actual}</strong></span>
                {c.threshold && <span className="text-gray-500">threshold: {c.threshold}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top issues */}
      {issues.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
            Top Issues — Bugs &amp; Vulnerabilities
          </div>
          <div className="space-y-2">
            {issues.map((issue) => (
              <div key={issue.key} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <Bug className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 leading-snug">{issue.message}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-500 font-mono">{issue.component}{issue.line ? `:${issue.line}` : ''}</span>
                    <span className={clsx(
                      'text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide',
                      SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS['INFO']
                    )}>
                      {issue.severity}
                    </span>
                    <span className="text-[9px] text-gray-600 uppercase">{issue.type}</span>
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
