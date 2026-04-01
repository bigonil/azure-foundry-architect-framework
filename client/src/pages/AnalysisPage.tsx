import { useState, useCallback } from 'react'

type ArtifactSource = 'upload' | 'github' | 'devops'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import {
  Play, Code2, Server, DollarSign,
  GitBranch, BarChart3, Shield, ShieldCheck, ChevronRight, Loader2,
  Sparkles, CheckCircle2, Github, Link2, FolderGit2, RefreshCw,
} from 'lucide-react'
import { analysisApi, isDemoMode, type AnalysisRequest, type ArtifactItem } from '../services/api'

const CLOUD_OPTIONS = [
  { value: 'aws', label: 'Amazon Web Services', icon: '☁️' },
  { value: 'gcp', label: 'Google Cloud Platform', icon: '🔷' },
  { value: 'azure', label: 'Microsoft Azure', icon: '🔵' },
  { value: 'on-premises', label: 'On-Premises', icon: '🏢' },
  { value: 'hybrid', label: 'Hybrid', icon: '🔗' },
]

const ANALYSIS_TYPES = [
  { value: 'code_analyzer', label: 'Code Analysis', icon: Code2, desc: 'Languages, frameworks, cloud SDKs' },
  { value: 'infra_analyzer', label: 'Infrastructure', icon: Server, desc: 'IaC resources, networking, security' },
  { value: 'cost_optimizer', label: 'Cost Optimization', icon: DollarSign, desc: 'FinOps, right-sizing, savings' },
  { value: 'migration_planner', label: 'Migration Plan', icon: GitBranch, desc: 'Wave planning, 6Rs strategy' },
  { value: 'gap_analyzer', label: 'GAP Analysis', icon: BarChart3, desc: 'Current vs target state gaps' },
  { value: 'waf_reviewer', label: 'WAF Review', icon: Shield, desc: '5 pillars Well-Architected review' },
  { value: 'quality_analyzer', label: 'Quality Gate', icon: ShieldCheck, desc: 'SonarQube-level code & IaC analysis' },
]

const AGENT_NAMES = [
  { key: 'code_analyzer', label: 'Code Analyzer', icon: Code2 },
  { key: 'infra_analyzer', label: 'Infra Analyzer', icon: Server },
  { key: 'cost_optimizer', label: 'Cost Optimizer', icon: DollarSign },
  { key: 'migration_planner', label: 'Migration Planner', icon: GitBranch },
  { key: 'gap_analyzer', label: 'GAP Analyzer', icon: BarChart3 },
  { key: 'waf_reviewer', label: 'WAF Reviewer', icon: Shield },
  { key: 'quality_analyzer', label: 'Quality Analyzer', icon: ShieldCheck },
]

// Demo pre-fill templates
const DEMO_TEMPLATES = [
  {
    label: 'AWS → Azure Migration',
    data: {
      project_name: 'Contoso E-Commerce Platform',
      source_cloud: 'aws' as const,
      current_monthly_cost_usd: 13100,
      additional_context: 'Microservices platform on ECS with 14 services, RDS PostgreSQL, ElastiCache Redis, SQS messaging, S3 storage, CloudFront CDN. Target: Azure PaaS with cost optimization.',
      code_files: ['app.py', 'order_service.py', 'product_service.py', 'user_service.py', 'payment_handler.ts'],
      iac_files: ['main.tf', 'ecs.tf', 'rds.tf', 'networking.tf'],
    },
  },
  {
    label: 'On-Prem Modernization',
    data: {
      project_name: 'TechCorp Legacy CRM',
      source_cloud: 'on-premises' as const,
      current_monthly_cost_usd: 22500,
      additional_context: '.NET Framework 4.8 monolith on Windows Server 2019, SQL Server 2017 with 340+ stored procedures, SSRS reporting, Kerberos auth. Goal: modernize to Azure with minimal disruption.',
      code_files: ['Program.cs', 'SalesController.cs', 'CustomerRepository.cs', 'BillingService.cs'],
      iac_files: ['infrastructure.yaml', 'sql-server-config.json'],
    },
  },
  {
    label: 'Azure Cost Optimization',
    data: {
      project_name: 'FinServ Trading API',
      source_cloud: 'azure' as const,
      current_monthly_cost_usd: 47300,
      additional_context: 'High-performance event-driven trading system on AKS (12 nodes), Azure SQL Hyperscale, Event Hubs Premium, Redis Enterprise. Processing 2.8M txns/day. Need to reduce costs without impacting SLAs.',
      code_files: ['trading_engine.go', 'order_book.go', 'matching_service.go', 'risk_calculator.go'],
      iac_files: ['main.bicep', 'aks.bicep', 'networking.bicep', 'monitoring.bicep'],
    },
  },
]

export default function AnalysisPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [agentProgress, setAgentProgress] = useState<Record<string, 'pending' | 'running' | 'done'>>({})
  const [artifactSource, setArtifactSource] = useState<ArtifactSource>('upload')
  const [repoConfig, setRepoConfig] = useState({
    github: { repoUrl: '', branch: 'main', token: '', folder: '' },
    devops: { orgUrl: '', project: '', repo: '', branch: 'main', token: '' },
  })
  const [repoLoading, setRepoLoading] = useState(false)

  const [form, setForm] = useState<AnalysisRequest>({
    project_name: '',
    source_cloud: 'aws',
    target_cloud: 'azure',
    analysis_types: ['all'],
    code_artifacts: [],
    iac_artifacts: [],
    additional_context: '',
    use_foundry_mode: false,
  })

  const readFiles = async (files: File[]): Promise<ArtifactItem[]> =>
    Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        content: await f.text(),
      }))
    )

  const onDropCode = useCallback(async (files: File[]) => {
    const artifacts = await readFiles(files)
    setForm((prev) => ({ ...prev, code_artifacts: [...prev.code_artifacts, ...artifacts] }))
    toast.success(`${files.length} code file(s) added`)
  }, [])

  const onDropIaC = useCallback(async (files: File[]) => {
    const artifacts = await readFiles(files)
    setForm((prev) => ({ ...prev, iac_artifacts: [...prev.iac_artifacts, ...artifacts] }))
    toast.success(`${files.length} IaC file(s) added`)
  }, [])

  const { getRootProps: getCodeProps, getInputProps: getCodeInput, isDragActive: codeDrag } = useDropzone({ onDrop: onDropCode, multiple: true })
  const { getRootProps: getIaCProps, getInputProps: getIaCInput, isDragActive: iacDrag } = useDropzone({ onDrop: onDropIaC, multiple: true })

  const toggleAnalysisType = (type: string) => {
    if (type === 'all') {
      setForm((prev) => ({ ...prev, analysis_types: ['all'] }))
      return
    }
    setForm((prev) => {
      const current = prev.analysis_types.filter((t) => t !== 'all')
      const updated = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type]
      return { ...prev, analysis_types: updated.length ? updated : ['all'] }
    })
  }

  const applyTemplate = (tpl: typeof DEMO_TEMPLATES[number]) => {
    const codeArtifacts = tpl.data.code_files.map((f) => ({
      filename: f,
      content: `// Demo file: ${f}\n// This is a placeholder for the ${tpl.data.project_name} project`,
    }))
    const iacArtifacts = tpl.data.iac_files.map((f) => ({
      filename: f,
      content: `# Demo IaC: ${f}\n# Infrastructure definition for ${tpl.data.project_name}`,
    }))

    setForm((prev) => ({
      ...prev,
      project_name: tpl.data.project_name,
      source_cloud: tpl.data.source_cloud,
      current_monthly_cost_usd: tpl.data.current_monthly_cost_usd,
      additional_context: tpl.data.additional_context,
      code_artifacts: codeArtifacts,
      iac_artifacts: iacArtifacts,
    }))
    toast.success(`Template "${tpl.label}" loaded`)
  }

  const runAgentAnimation = async (): Promise<void> => {
    const agents = AGENT_NAMES.map((a) => a.key)
    const progress: Record<string, 'pending' | 'running' | 'done'> = {}
    agents.forEach((a) => (progress[a] = 'pending'))
    setAgentProgress({ ...progress })
    setAnalyzing(true)

    // Phase 1: sequential (code_analyzer, infra_analyzer)
    for (const agent of agents.slice(0, 2)) {
      progress[agent] = 'running'
      setAgentProgress({ ...progress })
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 600))
      progress[agent] = 'done'
      setAgentProgress({ ...progress })
    }

    // Phase 2: parallel (remaining 4)
    const parallel = agents.slice(2)
    parallel.forEach((a) => (progress[a] = 'running'))
    setAgentProgress({ ...progress })
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800))
    parallel.forEach((a) => (progress[a] = 'done'))
    setAgentProgress({ ...progress })

    // Brief pause for synthesis
    await new Promise((r) => setTimeout(r, 600))
  }

  const handleConnectRepo = async (source: 'github' | 'devops') => {
    setRepoLoading(true)
    try {
      // In demo mode simulate a successful repo import with placeholder files
      await new Promise((r) => setTimeout(r, 1200))
      const label = source === 'github' ? repoConfig.github.repoUrl : repoConfig.devops.repo || repoConfig.devops.project
      const codeFiles = ['app.py', 'service.py', 'utils.py'].map((f) => ({
        filename: f,
        content: `# Imported from ${source}: ${label}\n# File: ${f}`,
      }))
      const iacFiles = ['main.tf', 'variables.tf'].map((f) => ({
        filename: f,
        content: `# Imported from ${source}: ${label}\n# IaC: ${f}`,
      }))
      setForm((prev) => ({ ...prev, code_artifacts: codeFiles, iac_artifacts: iacFiles }))
      toast.success(`Repository imported successfully (${codeFiles.length + iacFiles.length} files)`)
    } catch {
      toast.error('Failed to connect to repository')
    } finally {
      setRepoLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.project_name.trim()) {
      toast.error('Project name is required')
      return
    }
    if (form.code_artifacts.length === 0 && form.iac_artifacts.length === 0) {
      toast.error('Please upload at least one code or IaC file')
      return
    }

    setLoading(true)
    try {
      // Show agent progress animation
      await runAgentAnimation()

      const demo = await isDemoMode()
      if (demo) {
        // Demo mode: quickScan returns a full mock report immediately
        const { data } = await analysisApi.quickScan(form)
        toast.success('Analysis complete!')
        navigate(`/report/${data.session_id}`, { state: { report: data } })
      } else {
        // Real backend: start async analysis and navigate to report page for polling
        const { data } = await analysisApi.start(form)
        toast.success('Analysis started — monitoring progress...')
        navigate(`/report/${data.session_id}`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Analysis failed')
    } finally {
      setLoading(false)
      setAnalyzing(false)
      setAgentProgress({})
    }
  }

  const allSelected = form.analysis_types.includes('all')

  // Agent animation overlay
  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-gray-700 rounded-full" />
          <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full absolute top-0 animate-spin" />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-1">Multi-Agent Analysis Running</h2>
          <p className="text-gray-400 text-sm">6 specialist agents analyzing your project...</p>
        </div>

        <div className="w-full max-w-md space-y-3">
          {AGENT_NAMES.map(({ key, label, icon: Icon }) => {
            const status = agentProgress[key] ?? 'pending'
            return (
              <div
                key={key}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-500',
                  status === 'done'
                    ? 'border-green-800 bg-green-900/20'
                    : status === 'running'
                    ? 'border-blue-600 bg-blue-900/20 animate-pulse'
                    : 'border-gray-800 bg-gray-900'
                )}
              >
                <Icon className={clsx(
                  'w-4 h-4',
                  status === 'done' ? 'text-green-400' : status === 'running' ? 'text-blue-400' : 'text-gray-600'
                )} />
                <span className={clsx(
                  'text-sm font-medium flex-1',
                  status === 'done' ? 'text-green-300' : status === 'running' ? 'text-blue-300' : 'text-gray-500'
                )}>
                  {label}
                </span>
                {status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                {status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          Synthesizing results with GPT-4o...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">New Analysis</h1>
        <p className="text-gray-400 mt-1">
          Upload your code and IaC artifacts to start a multi-agent architecture analysis.
        </p>
      </div>

      {/* Demo Templates */}
      <section className="bg-gradient-to-r from-blue-950/50 to-purple-950/30 rounded-xl border border-blue-800/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-blue-300">Quick Start — Demo Templates</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {DEMO_TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              onClick={() => applyTemplate(tpl)}
              className="text-left p-3 rounded-lg border border-blue-800/30 bg-blue-900/20 hover:bg-blue-900/40 transition-colors"
            >
              <div className="text-sm font-medium text-white">{tpl.label}</div>
              <div className="text-xs text-gray-400 mt-1">{tpl.data.project_name}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Project Info */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-5">
        <h2 className="font-semibold text-white">1. Project Information</h2>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Project Name *</label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. my-e-commerce-platform"
            value={form.project_name}
            onChange={(e) => setForm((p) => ({ ...p, project_name: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Source Cloud *</label>
            <select
              title="Source Cloud"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.source_cloud}
              onChange={(e) => setForm((p) => ({ ...p, source_cloud: e.target.value as any }))}
            >
              {CLOUD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Monthly Cost (USD)</label>
            <input
              type="number"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 5000"
              value={form.current_monthly_cost_usd ?? ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, current_monthly_cost_usd: parseFloat(e.target.value) || undefined }))
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Additional Context</label>
          <textarea
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Describe your goals, constraints, or specific concerns..."
            value={form.additional_context}
            onChange={(e) => setForm((p) => ({ ...p, additional_context: e.target.value }))}
          />
        </div>
      </section>

      {/* Analysis Types */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="font-semibold text-white">2. Analysis Scope</h2>
        <div className="grid grid-cols-3 gap-3">
          {/* ALL button */}
          <button
            onClick={() => toggleAnalysisType('all')}
            className={clsx(
              'p-4 rounded-lg border text-left transition-all col-span-3',
              allSelected
                ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
            )}
          >
            <div className="font-medium text-sm">Full Analysis (All Agents)</div>
            <div className="text-xs mt-1 opacity-70">Run all 6 specialist agents in sequence</div>
          </button>

          {ANALYSIS_TYPES.map(({ value, label, icon: Icon, desc }) => (
            <button
              key={value}
              onClick={() => toggleAnalysisType(value)}
              className={clsx(
                'p-4 rounded-lg border text-left transition-all',
                !allSelected && form.analysis_types.includes(value)
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              )}
            >
              <Icon className="w-5 h-5 mb-2" />
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs mt-1 opacity-70">{desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Artifacts Source */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="font-semibold text-white">3. Artifact Source</h2>

        {/* Source tabs */}
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1 w-fit">
          {([
            { key: 'upload', label: 'File Upload', icon: FolderGit2 },
            { key: 'github', label: 'GitHub', icon: Github },
            { key: 'devops', label: 'Azure DevOps', icon: Link2 },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setArtifactSource(key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                artifactSource === key
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── File Upload ── */}
        {artifactSource === 'upload' && (
          <div className="grid grid-cols-2 gap-4">
            <div
              {...getCodeProps()}
              className={clsx(
                'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                codeDrag ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600'
              )}
            >
              <input {...getCodeInput()} />
              <Code2 className="w-8 h-8 text-gray-500 mx-auto mb-3" />
              <div className="text-sm font-medium text-gray-300">Code Files</div>
              <div className="text-xs text-gray-500 mt-1">.py .js .ts .java .cs .go ...</div>
              {form.code_artifacts.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs text-blue-400 font-medium">{form.code_artifacts.length} file(s) loaded</div>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {form.code_artifacts.map((a) => (
                      <span key={a.filename} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{a.filename}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              {...getIaCProps()}
              className={clsx(
                'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                iacDrag ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600'
              )}
            >
              <input {...getIaCInput()} />
              <Server className="w-8 h-8 text-gray-500 mx-auto mb-3" />
              <div className="text-sm font-medium text-gray-300">IaC Files</div>
              <div className="text-xs text-gray-500 mt-1">.tf .bicep .yaml .json (ARM/K8s)</div>
              {form.iac_artifacts.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs text-blue-400 font-medium">{form.iac_artifacts.length} file(s) loaded</div>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {form.iac_artifacts.map((a) => (
                      <span key={a.filename} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{a.filename}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── GitHub ── */}
        {artifactSource === 'github' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Repository URL</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://github.com/org/repo"
                  value={repoConfig.github.repoUrl}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, github: { ...p.github, repoUrl: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Branch</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="main"
                  value={repoConfig.github.branch}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, github: { ...p.github, branch: e.target.value } }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Personal Access Token</label>
                <input
                  type="password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={repoConfig.github.token}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, github: { ...p.github, token: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Folder path (optional)</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="src/ or infra/ (blank = root)"
                  value={repoConfig.github.folder}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, github: { ...p.github, folder: e.target.value } }))}
                />
              </div>
            </div>
            <button
              onClick={() => handleConnectRepo('github')}
              disabled={repoLoading || !repoConfig.github.repoUrl}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {repoLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              {repoLoading ? 'Connecting...' : 'Connect & Import Repository'}
            </button>
            {(form.code_artifacts.length > 0 || form.iac_artifacts.length > 0) && (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-4 py-2.5">
                <CheckCircle2 className="w-4 h-4" />
                {form.code_artifacts.length} code file(s) + {form.iac_artifacts.length} IaC file(s) imported from GitHub
              </div>
            )}
          </div>
        )}

        {/* ── Azure DevOps ── */}
        {artifactSource === 'devops' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Organization URL</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://dev.azure.com/my-org"
                  value={repoConfig.devops.orgUrl}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, orgUrl: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Project</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="MyProject"
                  value={repoConfig.devops.project}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, project: e.target.value } }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Repository Name</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="my-repo"
                  value={repoConfig.devops.repo}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, repo: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Branch</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="main"
                  value={repoConfig.devops.branch}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, branch: e.target.value } }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Personal Access Token (PAT)</label>
              <input
                type="password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="PAT con scope Code (read)"
                value={repoConfig.devops.token}
                onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, token: e.target.value } }))}
              />
            </div>
            <button
              onClick={() => handleConnectRepo('devops')}
              disabled={repoLoading || !repoConfig.devops.orgUrl || !repoConfig.devops.project}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {repoLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {repoLoading ? 'Connecting...' : 'Connect & Import Repository'}
            </button>
            {(form.code_artifacts.length > 0 || form.iac_artifacts.length > 0) && (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-4 py-2.5">
                <CheckCircle2 className="w-4 h-4" />
                {form.code_artifacts.length} code file(s) + {form.iac_artifacts.length} IaC file(s) imported from Azure DevOps
              </div>
            )}
          </div>
        )}
      </section>

      {/* Submit */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-gray-600 bg-gray-800 text-blue-500"
            checked={form.use_foundry_mode}
            onChange={(e) => setForm((p) => ({ ...p, use_foundry_mode: e.target.checked }))}
          />
          Use Azure AI Foundry Agent Service (full persistence)
        </label>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'Analyzing...' : 'Start Analysis'}
          {!loading && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
