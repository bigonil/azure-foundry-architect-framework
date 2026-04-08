import { useParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
  CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Shield, ShieldCheck, Server, Code2, DollarSign, GitBranch,
  BarChart3, Bug, ExternalLink, Activity, Zap, TrendingUp, Users, Clock,
  Download, Printer, Loader2,
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
  mcp_enrichment: Zap,
  cost_optimizer: DollarSign,
  migration_planner: GitBranch,
  gap_analyzer: BarChart3,
  waf_reviewer: Shield,
  quality_analyzer: ShieldCheck,
}

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const location = useLocation()

  // Hooks must ALL be at the top — before any conditional returns
  const reportRef = useRef<HTMLDivElement>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // If report was passed via navigation state (demo mode), use it directly
  const preloadedReport = location.state?.report as AnalysisReport | undefined

  // -- Step 1: Poll /status every 3s while analysis is running -------------
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

  // -- Step 2: Fetch report only once status = completed -------------------
  const { data: report, isLoading: reportLoading, error: reportError } = useQuery({
    queryKey: ['report', sessionId],
    queryFn: async () => {
      if (preloadedReport) return preloadedReport
      const { data } = await analysisApi.getReport(sessionId!)
      return data
    },
    enabled: !!preloadedReport || (!!sessionId && statusData?.status === 'completed'),
  })

  // -- Loading: still running -----------------------------------------------
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

  // -- Error: analysis failed or network error ------------------------------
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

  // -- Loading: report fetch in flight -------------------------------------
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

  const downloadPdf = async () => {
    const element = reportRef.current
    if (!element) return
    setGeneratingPdf(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(element, {
        scale: 1.5,
        backgroundColor: '#030712',
        useCORS: true,
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgH = (canvas.height * pageW) / canvas.width
      let remaining = imgH
      let posY = 0
      pdf.addImage(imgData, 'PNG', 0, posY, pageW, imgH)
      remaining -= pageH
      while (remaining > 0) {
        posY -= pageH
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, posY, pageW, imgH)
        remaining -= pageH
      }
      pdf.save(`${report.project_name}-analysis.pdf`)
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handlePrint = () => window.print()

  const synthesis = report.synthesis
  const maturityScore = synthesis.maturity_score ?? 0

  return (
    <div id="report-content" ref={reportRef} className="space-y-8">
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

        <div className="flex items-center gap-3">
          {/* Print / PDF actions */}
          <div className="flex items-center gap-2 no-print" data-no-print>
            <button
              onClick={handlePrint}
              title="Print report"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={downloadPdf}
              disabled={generatingPdf}
              title="Download as PDF"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-600/50 bg-blue-600/10 text-xs text-blue-400 hover:bg-blue-600/20 disabled:opacity-50 transition-colors"
            >
              {generatingPdf
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              {generatingPdf ? 'Generating…' : 'Download PDF'}
            </button>
          </div>

          <div className="text-right">
            <div className="text-3xl font-bold text-white">{maturityScore.toFixed(1)}<span className="text-gray-500 text-lg">/5</span></div>
            <div className="text-xs text-gray-500 mt-1">Maturity Score</div>
            <div
              className="text-xs text-gray-600 mt-1 max-w-[220px] text-right leading-snug"
              title="Calcolato da Claude su: qualità del codice (SonarCloud + analisi statica), grado di coupling con il cloud provider corrente, e complessità dell'infrastruttura. 1 = legacy/alto rischio · 5 = cloud-native/pronto alla migrazione"
            >
              Basato su qualità codice, coupling e complessità infra
            </div>
          </div>
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
                title={result.input_tokens ? `${result.input_tokens}↑ ${result.output_tokens}↓ tokens · €${result.cost_eur?.toFixed(4)}` : undefined}
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

      {/* -- Token & Cost Panel ------------------------------------------------- */}
      {(report.total_input_tokens ?? 0) > 0 && (
        <TokenCostPanel report={report} />
      )}

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

      {/* -- Migration Effort Detail --------------------------------------------- */}
      {synthesis.effort_detail && (
        <EffortDetailSection effort={synthesis.effort_detail} />
      )}

      {/* -- SonarCloud Static Analysis ----------------------------------------- */}
      <SonarCloudSection data={report.sonarqube_analysis} />

      {/* -- MCP Enrichment panel ------------------------------------------------ */}
      <McpEnrichmentPanel report={report} />
    </div>
  )
}

// -- Token & Cost panel -------------------------------------------------------

function TokenCostPanel({ report }: { report: AnalysisReport }) {
  const settings = { inputPer1M: 15, outputPer1M: 75, budgetEur: 100 }
  const totalIn   = report.total_input_tokens ?? 0
  const totalOut  = report.total_output_tokens ?? 0
  const totalCost = report.total_cost_eur ?? 0
  const budgetUsedPct = Math.min((totalCost / settings.budgetEur) * 100, 100)
  const remaining = Math.max(settings.budgetEur - totalCost, 0)

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-yellow-400" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Token Usage &amp; Cost</h3>
        <span className="text-xs text-gray-500">Claude claude-opus-4-6 · €15/M in · €75/M out</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-blue-300">{(totalIn / 1000).toFixed(1)}<span className="text-sm font-normal text-gray-400 ml-0.5">K</span></div>
          <div className="text-xs text-gray-500 mt-1">Input Tokens</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-green-300">{(totalOut / 1000).toFixed(1)}<span className="text-sm font-normal text-gray-400 ml-0.5">K</span></div>
          <div className="text-xs text-gray-500 mt-1">Output Tokens</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-yellow-300">€{totalCost.toFixed(4)}</div>
          <div className="text-xs text-gray-500 mt-1">Analysis Cost</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <div className={clsx('text-2xl font-bold', remaining < 10 ? 'text-red-400' : 'text-white')}>€{remaining.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">Remaining (€{settings.budgetEur} budget)</div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Monthly budget used</span>
          <span>{budgetUsedPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', budgetUsedPct > 80 ? 'bg-red-500' : budgetUsedPct > 50 ? 'bg-yellow-500' : 'bg-green-500')}
            style={{ width: `${budgetUsedPct}%` }}
          />
        </div>
      </div>

      {/* Per-agent breakdown — always shown when agent_results exist */}
      {Object.keys(report.agent_results).length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Per-Agent Breakdown</div>
          {Object.entries(report.agent_results).map(([name, r]) => {
            const inTok   = r.input_tokens  ?? 0
            const outTok  = r.output_tokens ?? 0
            const agentCost = r.cost_eur ?? 0
            const barPct = totalCost > 0 ? (agentCost / totalCost) * 100 : 0
            const Icon = AGENT_ICONS[name] ?? CheckCircle2
            const hasTokens = inTok > 0 || outTok > 0
            return (
              <div key={name} className="flex items-center gap-3">
                <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', hasTokens ? 'text-gray-400' : 'text-gray-600')} />
                <span className={clsx('text-xs w-32 truncate capitalize', hasTokens ? 'text-gray-400' : 'text-gray-600')}>
                  {name.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${barPct}%` }} />
                </div>
                <span className={clsx('text-xs w-24 text-right', hasTokens ? 'text-gray-500' : 'text-gray-700')}>
                  {(inTok / 1000).toFixed(1)}K↑ {(outTok / 1000).toFixed(1)}K↓
                </span>
                <span className={clsx('text-xs w-16 text-right', hasTokens ? 'text-yellow-400' : 'text-gray-700')}>
                  {hasTokens ? `€${agentCost.toFixed(4)}` : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -- Migration Effort Detail ---------------------------------------------------

type EffortRole = { role: string; allocation_pct: number; person_days: number; daily_rate_eur: number; total_eur: number }
type EffortPhase = { wave: number; name: string; person_days: number; hours: number; focus: string }
type EffortComponent = { component: string; strategy: string; risk: string; base_days: number; final_days: number }

type EffortDetail = {
  total_person_days: number
  total_hours: number
  calculation_method: string
  assumptions: string[]
  roles: EffortRole[]
  phases: EffortPhase[]
  complexity_breakdown: EffortComponent[]
  total_cost_eur: number
}

const RISK_COLORS: Record<string, string> = {
  low: 'text-green-400 bg-green-500/10 border-green-500/30',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  high: 'text-red-400 bg-red-500/10 border-red-500/30',
}

function EffortDetailSection({ effort }: { effort: EffortDetail }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
      {/* Header KPIs */}
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-5 h-5 text-blue-400" />
        <h3 className="font-semibold text-white">Migration Effort Breakdown</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <div className="text-3xl font-bold text-white">{effort.total_person_days}</div>
          <div className="text-xs text-gray-500 mt-1">Person-Days</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <div className="text-3xl font-bold text-white">{effort.total_hours.toLocaleString('it-IT')}</div>
          <div className="text-xs text-gray-500 mt-1">Total Hours</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-green-400">€{effort.total_cost_eur?.toLocaleString('it-IT')}</div>
          <div className="text-xs text-gray-500 mt-1">Labour Cost (EUR)</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
          <div className="text-xs text-gray-400 leading-tight">{effort.calculation_method}</div>
        </div>
      </div>

      {/* Assumptions */}
      {effort.assumptions?.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Assumptions</div>
          <ul className="space-y-1">
            {effort.assumptions.map((a, i) => (
              <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-gray-600 mt-0.5 flex-shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Roles */}
      {effort.roles?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-gray-500" />
            <div className="text-xs text-gray-500 uppercase tracking-wider">Team Allocation</div>
          </div>
          <div className="space-y-2">
            {effort.roles.map((r) => {
              const barPct = effort.total_person_days > 0 ? (r.person_days / effort.total_person_days) * 100 : 0
              return (
                <div key={r.role} className="flex items-center gap-3">
                  <span className="text-sm text-gray-300 w-48 flex-shrink-0">{r.role}</span>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-24 text-right">{r.person_days}d · {r.allocation_pct}%</span>
                  <span className="text-xs text-green-400 w-24 text-right">€{r.total_eur?.toLocaleString('it-IT')}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Wave phases */}
      {effort.phases?.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Wave Planning</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {effort.phases.map((p) => (
              <div key={p.wave} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="text-[10px] text-blue-400 uppercase tracking-wider">Wave {p.wave}</div>
                <div className="font-medium text-white text-sm mt-1">{p.name}</div>
                <div className="text-xs text-gray-400 mt-1">{p.person_days}d · {p.hours}h</div>
                <div className="text-xs text-gray-600 mt-1 leading-tight">{p.focus}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complexity breakdown */}
      {effort.complexity_breakdown?.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Component Complexity</div>
          <div className="space-y-1.5">
            {effort.complexity_breakdown.map((c, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-gray-300 flex-1 truncate">{c.component}</span>
                <span className="text-xs text-gray-500 capitalize">{c.strategy}</span>
                <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border', RISK_COLORS[c.risk] ?? RISK_COLORS.low)}>
                  {c.risk}
                </span>
                <span className="text-xs text-gray-500 w-24 text-right">
                  {c.base_days}d → <strong className="text-white">{c.final_days}d</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -- SonarCloud section component ---------------------------------------------

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

// -- MCP Enrichment Panel ──────────────────────────────────────────────────────

function McpEnrichmentPanel({ report }: { report: AnalysisReport }) {
  const enrichment = (report.agent_results?.mcp_enrichment as any)
  if (!enrichment || enrichment.status !== 'success') return null

  const data = enrichment.data ?? {}
  const readiness  = data.migration_readiness ?? {}
  const pricing    = data.azure_pricing_estimate ?? {}
  const advisor    = (data.advisor_recommendations ?? []) as any[]
  const waf        = data.waf_assessment ?? {}
  const refArchs   = (data.reference_architectures ?? []) as any[]
  const practices  = (data.best_practices ?? []) as string[]
  const skillsCalled = (data.azure_skills_called ?? []) as string[]
  const quality    = data.enrichment_quality ?? 'unknown'

  const wafPillars = ['reliability', 'security', 'cost_optimization', 'operational_excellence', 'performance_efficiency']
  const wafColors: Record<number, string> = { 5: 'text-green-400', 4: 'text-blue-400', 3: 'text-yellow-400', 2: 'text-orange-400', 1: 'text-red-400' }

  return (
    <div className="bg-gray-900 rounded-xl border border-blue-800/40 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-white">Azure MCP Enrichment</span>
          <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Live Azure Data
          </span>
          <span className={clsx(
            'text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider',
            quality === 'high' ? 'text-green-400 bg-green-500/10 border border-green-500/30'
              : quality === 'medium' ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/30'
              : 'text-gray-400 bg-gray-700'
          )}>
            Quality: {quality}
          </span>
        </div>
        {skillsCalled.length > 0 && (
          <span className="text-xs text-gray-500">{skillsCalled.length} Azure Skills called</span>
        )}
      </div>

      {/* Skills called badges */}
      {skillsCalled.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skillsCalled.map((s) => (
            <span key={s} className="text-[10px] text-blue-300/70 bg-blue-900/20 border border-blue-800/30 px-1.5 py-0.5 rounded font-mono">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Migration Readiness */}
        {readiness.overall_score != null && (
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Migration Readiness</div>
            <div className="text-2xl font-bold text-white">{readiness.overall_score}</div>
            {readiness.suitability && (
              <div className={clsx(
                'text-xs font-medium px-2 py-0.5 rounded-full inline-block',
                readiness.suitability === 'cloud' ? 'text-green-400 bg-green-500/10'
                  : readiness.suitability === 'conditional' ? 'text-yellow-400 bg-yellow-500/10'
                  : 'text-red-400 bg-red-500/10'
              )}>
                {readiness.suitability}
              </div>
            )}
            {readiness.recommendations?.length > 0 && (
              <ul className="space-y-1 mt-2">
                {(readiness.recommendations as string[]).slice(0, 3).map((r, i) => (
                  <li key={i} className="text-xs text-gray-400 flex gap-1.5"><span className="text-blue-400 mt-0.5">›</span>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Azure Pricing Estimate */}
        {pricing.monthly_eur != null && (
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Azure Pricing Estimate</div>
            <div className="text-2xl font-bold text-green-400">€{Number(pricing.monthly_eur).toLocaleString()}<span className="text-sm font-normal text-gray-400">/mo</span></div>
            {pricing.breakdown?.length > 0 && (
              <div className="space-y-1 mt-1">
                {(pricing.breakdown as any[]).slice(0, 4).map((b: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-400 truncate">{b.service}{b.sku ? ` (${b.sku})` : ''}</span>
                    <span className="text-gray-300 ml-2 shrink-0">€{Number(b.monthly_eur ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* WAF Assessment */}
      {Object.keys(waf).length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Well-Architected Framework (from Azure MCP)</div>
          <div className="grid grid-cols-5 gap-2">
            {wafPillars.map((pillar) => {
              const p = waf[pillar] ?? {}
              const score = p.score ?? 0
              return (
                <div key={pillar} className="text-center">
                  <div className={clsx('text-xl font-bold', wafColors[score] ?? 'text-gray-400')}>{score || '—'}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5 capitalize">{pillar.replace(/_/g, ' ')}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Advisor Recommendations */}
      {advisor.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Azure Advisor Recommendations</div>
          <div className="space-y-1.5">
            {advisor.slice(0, 6).map((rec: any, i: number) => (
              <div key={i} className="flex items-start gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <span className={clsx(
                  'text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5',
                  rec.severity === 'high' ? 'text-red-400 bg-red-500/10' : rec.severity === 'medium' ? 'text-yellow-400 bg-yellow-500/10' : 'text-green-400 bg-green-500/10'
                )}>{rec.severity ?? 'info'}</span>
                <span className="text-xs text-gray-400">{rec.recommendation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reference Architectures */}
      {refArchs.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Reference Architectures</div>
          <div className="grid grid-cols-3 gap-2">
            {refArchs.slice(0, 3).map((arch: any, i: number) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs font-medium text-white mb-1">{arch.name}</div>
                <div className="text-[10px] text-gray-500 leading-snug">{arch.description}</div>
                {arch.url && (
                  <a href={arch.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline mt-1 flex items-center gap-1">
                    <ExternalLink className="w-2.5 h-2.5" /> Docs
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best Practices */}
      {practices.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Azure Best Practices</div>
          <div className="grid grid-cols-2 gap-1.5">
            {practices.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                <CheckCircle2 className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                {p}
              </div>
            ))}
          </div>
        </div>
      )}
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
