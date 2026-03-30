import { useState } from 'react'
import { clsx } from 'clsx'
import {
  ShieldCheck, Bug, AlertTriangle, Code2, Lock,
  TrendingUp, Clock, CheckCircle2, XCircle, Info,
  BarChart3, Layers,
} from 'lucide-react'

// ── Mock SonarQube data ──────────────────────────────────────────────────────
const qualityGate = {
  status: 'PASSED' as const,
  project: 'azure-foundry-architect-framework',
  lastAnalysis: '2026-03-30T08:42:00Z',
  version: '1.0.0',
}

const metrics = {
  bugs: { value: 2, rating: 'A', trend: -3 },
  vulnerabilities: { value: 0, rating: 'A', trend: 0 },
  codeSmells: { value: 18, rating: 'A', trend: -7 },
  securityHotspots: { value: 1, rating: 'A', reviewed: 100 },
  coverage: { value: 78.4, rating: 'B', trend: 2.1 },
  duplications: { value: 1.8, rating: 'A', trend: -0.3 },
  lines: 4280,
  technicalDebt: '2h 15min',
  reliabilityRating: 'A',
  securityRating: 'A',
  maintainabilityRating: 'A',
}

const RATING_COLORS: Record<string, string> = {
  A: 'bg-green-500 text-white',
  B: 'bg-lime-500 text-white',
  C: 'bg-yellow-500 text-white',
  D: 'bg-orange-500 text-white',
  E: 'bg-red-500 text-white',
}

const issues = [
  { type: 'BUG', severity: 'MINOR', file: 'src/agents/orchestrator.py', line: 87, message: 'Refactor this function to reduce cognitive complexity from 18 to the 15 allowed', effort: '30min' },
  { type: 'BUG', severity: 'MINOR', file: 'src/tools/code_scanner.py', line: 142, message: 'Remove this redundant assignment to variable "result"', effort: '5min' },
  { type: 'CODE_SMELL', severity: 'MINOR', file: 'src/api/routes/analysis.py', line: 54, message: 'Rename this local variable to match the regular expression ^[_a-z][a-z0-9_]*$', effort: '2min' },
  { type: 'CODE_SMELL', severity: 'INFO', file: 'src/config/settings.py', line: 31, message: 'Complete the task associated with this TODO comment', effort: '0min' },
  { type: 'CODE_SMELL', severity: 'MINOR', file: 'src/agents/base_agent.py', line: 112, message: 'Merge this if statement with the enclosing one', effort: '5min' },
  { type: 'CODE_SMELL', severity: 'INFO', file: 'client/src/pages/ReportPage.tsx', line: 26, message: "Define a constant instead of duplicating this literal 'text-gray-500' 4 times", effort: '5min' },
  { type: 'SECURITY_HOTSPOT', severity: 'MEDIUM', file: 'src/api/main.py', line: 51, message: 'Make sure that CORS is safe here — verify allowed origins in production', effort: '15min' },
]

const coverageByModule = [
  { module: 'src/agents/', coverage: 82.1, lines: 1420, color: 'bg-blue-500' },
  { module: 'src/api/', coverage: 74.6, lines: 680, color: 'bg-emerald-500' },
  { module: 'src/tools/', coverage: 88.3, lines: 920, color: 'bg-amber-500' },
  { module: 'src/config/', coverage: 65.2, lines: 180, color: 'bg-purple-500' },
  { module: 'client/src/', coverage: 71.0, lines: 1080, color: 'bg-rose-500' },
]

const TYPE_ICONS: Record<string, any> = {
  BUG: Bug,
  CODE_SMELL: Code2,
  VULNERABILITY: Lock,
  SECURITY_HOTSPOT: AlertTriangle,
}

const SEVERITY_COLORS: Record<string, string> = {
  BLOCKER: 'text-red-400 bg-red-500/10 border-red-500/30',
  CRITICAL: 'text-red-400 bg-red-500/10 border-red-500/30',
  MAJOR: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  MEDIUM: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  MINOR: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  INFO: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

type Tab = 'overview' | 'issues' | 'coverage'

export default function QualityPage() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Code Quality</h1>
          <p className="text-gray-400 mt-1 text-sm">
            SonarQube analysis — {qualityGate.project}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500">
            Last scan: {new Date(qualityGate.lastAnalysis).toLocaleString()}
          </div>
          <div className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold',
            qualityGate.status === 'PASSED'
              ? 'text-green-400 bg-green-500/10 border-green-500/30'
              : 'text-red-400 bg-red-500/10 border-red-500/30'
          )}>
            {qualityGate.status === 'PASSED'
              ? <CheckCircle2 className="w-4 h-4" />
              : <XCircle className="w-4 h-4" />
            }
            Quality Gate {qualityGate.status}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800 w-fit">
        {([
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'issues', label: 'Issues', icon: Bug },
          { key: 'coverage', label: 'Coverage', icon: Layers },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              tab === key
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Rating Cards */}
          <div className="grid grid-cols-3 gap-4">
            <RatingCard
              label="Reliability"
              rating={metrics.reliabilityRating}
              icon={Bug}
              detail={`${metrics.bugs.value} bugs`}
              trend={metrics.bugs.trend !== 0 ? `${metrics.bugs.trend}` : undefined}
            />
            <RatingCard
              label="Security"
              rating={metrics.securityRating}
              icon={Lock}
              detail={`${metrics.vulnerabilities.value} vulnerabilities`}
              trend={undefined}
            />
            <RatingCard
              label="Maintainability"
              rating={metrics.maintainabilityRating}
              icon={Code2}
              detail={`${metrics.codeSmells.value} code smells`}
              trend={metrics.codeSmells.trend !== 0 ? `${metrics.codeSmells.trend}` : undefined}
            />
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard
              label="Coverage"
              value={`${metrics.coverage.value}%`}
              rating={metrics.coverage.rating}
              sub={`${metrics.coverage.trend > 0 ? '+' : ''}${metrics.coverage.trend}% since last`}
              color="text-lime-400"
            />
            <MetricCard
              label="Duplications"
              value={`${metrics.duplications.value}%`}
              rating={metrics.duplications.rating}
              sub={`${metrics.duplications.trend}% since last`}
              color="text-green-400"
            />
            <MetricCard
              label="Technical Debt"
              value={metrics.technicalDebt}
              sub={`${metrics.lines.toLocaleString()} lines analyzed`}
              color="text-blue-400"
            />
            <MetricCard
              label="Security Hotspots"
              value={String(metrics.securityHotspots.value)}
              rating={metrics.securityHotspots.rating}
              sub={`${metrics.securityHotspots.reviewed}% reviewed`}
              color="text-amber-400"
            />
          </div>

          {/* Issues Breakdown */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h3 className="font-semibold text-white mb-4">Issues Breakdown</h3>
            <div className="grid grid-cols-4 gap-6">
              <IssueBreakdown icon={Bug} label="Bugs" count={metrics.bugs.value} color="text-red-400" />
              <IssueBreakdown icon={Lock} label="Vulnerabilities" count={metrics.vulnerabilities.value} color="text-orange-400" />
              <IssueBreakdown icon={Code2} label="Code Smells" count={metrics.codeSmells.value} color="text-yellow-400" />
              <IssueBreakdown icon={AlertTriangle} label="Security Hotspots" count={metrics.securityHotspots.value} color="text-purple-400" />
            </div>
          </div>
        </div>
      )}

      {/* Issues Tab */}
      {tab === 'issues' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-white">All Issues ({issues.length})</h3>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/30">
                {issues.filter((i) => i.type === 'BUG').length} Bugs
              </span>
              <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                {issues.filter((i) => i.type === 'CODE_SMELL').length} Code Smells
              </span>
              <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                {issues.filter((i) => i.type === 'SECURITY_HOTSPOT').length} Hotspots
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {issues.map((issue, i) => {
              const Icon = TYPE_ICONS[issue.type] ?? Info
              return (
                <div key={i} className="flex items-start gap-3 p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <Icon className={clsx('w-4 h-4 mt-0.5 flex-shrink-0',
                    issue.type === 'BUG' ? 'text-red-400'
                    : issue.type === 'SECURITY_HOTSPOT' ? 'text-purple-400'
                    : 'text-yellow-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">{issue.message}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="font-mono">{issue.file}:{issue.line}</span>
                      <span>·</span>
                      <span className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-medium', SEVERITY_COLORS[issue.severity])}>
                        {issue.severity}
                      </span>
                      {issue.effort !== '0min' && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{issue.effort}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Coverage Tab */}
      {tab === 'coverage' && (
        <div className="space-y-6">
          {/* Overall coverage */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Overall Coverage</h3>
              <div className="text-3xl font-bold text-white">
                {metrics.coverage.value}<span className="text-gray-500 text-lg">%</span>
              </div>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-lime-400 rounded-full transition-all"
                style={{ width: `${metrics.coverage.value}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0%</span>
              <span className="text-lime-400 font-medium">{metrics.coverage.value}% covered</span>
              <span>100%</span>
            </div>
          </div>

          {/* Coverage by module */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h3 className="font-semibold text-white mb-5">Coverage by Module</h3>
            <div className="space-y-4">
              {coverageByModule.map((mod) => (
                <div key={mod.module}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-mono text-gray-300">{mod.module}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">{mod.lines} lines</span>
                      <span className={clsx(
                        'font-semibold',
                        mod.coverage >= 80 ? 'text-green-400' : mod.coverage >= 60 ? 'text-yellow-400' : 'text-red-400'
                      )}>
                        {mod.coverage}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all', mod.color)}
                      style={{ width: `${mod.coverage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function RatingCard({ label, rating, icon: Icon, detail, trend }: {
  label: string; rating: string; icon: any; detail: string; trend?: string
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
        <span className={clsx('w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold', RATING_COLORS[rating])}>
          {rating}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-300">{detail}</span>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-2 text-xs">
          <TrendingUp className={clsx('w-3 h-3', parseInt(trend) < 0 ? 'text-green-400 rotate-180' : 'text-red-400')} />
          <span className={parseInt(trend) < 0 ? 'text-green-400' : 'text-red-400'}>
            {trend} since last analysis
          </span>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, rating, sub, color }: {
  label: string; value: string; rating?: string; sub?: string; color: string
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
        {rating && (
          <span className={clsx('w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center', RATING_COLORS[rating])}>
            {rating}
          </span>
        )}
      </div>
      <div className={clsx('text-2xl font-bold', color)}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

function IssueBreakdown({ icon: Icon, label, count, color }: {
  icon: any; label: string; count: number; color: string
}) {
  return (
    <div className="text-center">
      <Icon className={clsx('w-6 h-6 mx-auto mb-2', color)} />
      <div className="text-2xl font-bold text-white">{count}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
