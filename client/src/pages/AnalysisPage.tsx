import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import {
  Play, Code2, Server, DollarSign,
  GitBranch, BarChart3, Shield, ShieldCheck, ChevronRight, Loader2,
  Sparkles, CheckCircle2, Github, Link2, FolderGit2, RefreshCw, FolderOpen, HardDrive,
  Database, Upload, X, Zap, Info,
} from 'lucide-react'
import { analysisApi, artifactsApi, isDemoMode, type AnalysisRequest, type ArtifactItem, type BlobArtifactRef, type McpServerConfig } from '../services/api'

type ArtifactSource = 'upload' | 'blob' | 'volume' | 'github' | 'devops'

const CLOUD_OPTIONS = [
  { value: 'aws', label: 'Amazon Web Services', icon: '☁️' },
  { value: 'gcp', label: 'Google Cloud Platform', icon: '🔷' },
  { value: 'azure', label: 'Microsoft Azure', icon: '🔵' },
  { value: 'on-premises', label: 'On-Premises', icon: '🏢' },
  { value: 'hybrid', label: 'Hybrid', icon: '🔗' },
]

// MVP_AGENTS: active in this release. Others shown as grayed-out/coming-soon.
const MVP_AGENTS = new Set(['code_analyzer', 'infra_analyzer'])

const ANALYSIS_TYPES = [
  { value: 'code_analyzer',    label: 'Code Analysis',     icon: Code2,      desc: 'Languages, frameworks, cloud SDKs',           mvp: true  },
  { value: 'infra_analyzer',   label: 'Infrastructure',    icon: Server,     desc: 'IaC resources, networking, security',          mvp: true  },
  { value: 'cost_optimizer',   label: 'Cost Optimization', icon: DollarSign, desc: 'FinOps, right-sizing, savings',                mvp: false },
  { value: 'migration_planner',label: 'Migration Plan',    icon: GitBranch,  desc: 'Wave planning, 6Rs strategy',                  mvp: false },
  { value: 'gap_analyzer',     label: 'GAP Analysis',      icon: BarChart3,  desc: 'Current vs target state gaps',                 mvp: false },
  { value: 'waf_reviewer',     label: 'WAF Review',        icon: Shield,     desc: '5 pillars Well-Architected review',            mvp: false },
  { value: 'quality_analyzer', label: 'Quality Gate',      icon: ShieldCheck,desc: 'SonarQube-level code & IaC analysis',          mvp: false },
]

const AGENT_NAMES = [
  { key: 'code_analyzer',     label: 'Code Analyzer',     icon: Code2 },
  { key: 'infra_analyzer',    label: 'Infra Analyzer',    icon: Server },
  { key: 'cost_optimizer',    label: 'Cost Optimizer',    icon: DollarSign },
  { key: 'migration_planner', label: 'Migration Planner', icon: GitBranch },
  { key: 'gap_analyzer',      label: 'GAP Analyzer',      icon: BarChart3 },
  { key: 'waf_reviewer',      label: 'WAF Reviewer',      icon: Shield },
  { key: 'quality_analyzer',  label: 'Quality Analyzer',  icon: ShieldCheck },
]

// -- Pre-configured MCP servers (internal Docker services, URL managed server-side) --------
// Toggle only — URL is injected by the backend from settings.
// Start with: docker compose --profile mcp up
const PRECONFIGURED_MCP_SERVERS: McpServerConfig[] = [
  {
    id: 'azure-mcp-internal',
    name: 'Azure MCP',
    type: 'url',
    url: '',          // real URL injected by backend
    enabled: false,
    cloud: 'azure',
    preconfigured: true,
  },
  {
    id: 'azure-devops-mcp-internal',
    name: 'Azure DevOps MCP',
    type: 'url',
    url: '',
    enabled: false,
    cloud: 'devops',
    preconfigured: true,
  },
]

// Azure Skills exposed by the Azure MCP server (informational — shown in UI)
const AZURE_SKILLS_BY_CATEGORY: Record<string, string[]> = {
  'Migration': ['azure-migrate', 'cloud-architect', 'best-practices', 'terraform-best-practices'],
  'WAF & Docs': ['well-architected-framework', 'documentation', 'bicep-schema'],
  'Pricing & Advisor': ['pricing', 'advisor', 'quota', 'marketplace'],
  'Compute': ['compute', 'aks', 'app-service', 'container-apps', 'functions', 'function-app'],
  'Databases': ['sql', 'postgres', 'mysql', 'cosmos', 'redis'],
  'Messaging': ['service-bus', 'event-hubs', 'event-grid', 'signalr'],
  'Storage & Security': ['storage', 'file-shares', 'key-vault', 'role', 'policy'],
  'Observability': ['monitor', 'application-insights', 'grafana', 'workbooks'],
  'Resources': ['group-list', 'group-resource-list', 'subscription-list', 'resource-health'],
}

// Azure DevOps Tools exposed by the Azure DevOps MCP server
const DEVOPS_SKILLS_BY_CATEGORY: Record<string, string[]> = {
  'Core': ['core_list_projects', 'core_list_project_teams'],
  'Repos': ['repo_list_repos', 'repo_list_pull_requests', 'repo_list_branches', 'repo_search_commits'],
  'Work Items': ['wit_my_work_items', 'wit_list_backlogs', 'wit_get_work_item', 'search_workitem'],
  'Pipelines': ['pipelines_get_builds', 'pipelines_list_runs', 'pipelines_get_build_log'],
  'Wiki & Test': ['wiki_list_wikis', 'wiki_get_page_content', 'testplan_list_test_plans'],
  'Search': ['search_code', 'search_wiki', 'search_workitem'],
}

// -- Custom MCP servers (user-provided URLs) ------------------------------------------
const DEFAULT_CUSTOM_MCP_SERVERS: McpServerConfig[] = [
  { id: 'aws-cdk-mcp',  name: 'AWS CDK MCP',  type: 'stdio', url: '', enabled: false, cloud: 'aws' },
  { id: 'aws-docs-mcp', name: 'AWS Docs MCP', type: 'stdio', url: '', enabled: false, cloud: 'aws' },
  { id: 'aws-cost-mcp', name: 'AWS Cost MCP', type: 'stdio', url: '', enabled: false, cloud: 'aws' },
  { id: 'gcp-mcp',      name: 'GCP MCP',      type: 'stdio', url: '', enabled: false, cloud: 'gcp' },
]

const MCP_CLOUD_LABELS: Record<string, string> = {
  azure: 'Azure',
  devops: 'Azure DevOps',
  aws: 'AWS',
  gcp: 'GCP',
}

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
  const [agentProgress, setAgentProgress] = useState<Record<string, 'pending' | 'running' | 'done' | 'skipped'>>({})
  const [artifactSource, setArtifactSource] = useState<ArtifactSource>('upload')
  const [persistToVolume, setPersistToVolume] = useState(false)
  const [persistSubfolder, setPersistSubfolder] = useState('')
  const [persistSaving, setPersistSaving] = useState(false)
  const [persistedFolders, setPersistedFolders] = useState<{ code: string; iac: string }>({ code: '', iac: '' })
  const [blobArtifacts, setBlobArtifacts] = useState<BlobArtifactRef[]>([])
  const [blobUploading, setBlobUploading] = useState(false)
  const [volumeConfig, setVolumeConfig] = useState({ codeFolder: '', iacFolder: '' })
  const [repoConfig, setRepoConfig] = useState({
    github: { repoUrl: '', branch: 'main', token: '', codeFolder: '', iacFolder: '' },
    devops: { orgUrl: '', project: '', repo: '', branch: 'main', token: '', codeFolder: '', iacFolder: '' },
  })
  const [repoLoading, setRepoLoading] = useState(false)
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([
    ...PRECONFIGURED_MCP_SERVERS,
    ...DEFAULT_CUSTOM_MCP_SERVERS,
  ])
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({})

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

  const codeFolderInputRef = useRef<HTMLInputElement>(null)
  const iacFolderInputRef = useRef<HTMLInputElement>(null)

  // Directories to skip entirely when walking a folder upload
  const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist', 'build', '.next', 'vendor', 'target'])

  // Extensions treated as text/code (binary files are excluded)
  const CODE_EXTS = new Set([
    'py','js','ts','tsx','jsx','java','cs','go','rb','php','cpp','c','h','rs','kt','swift',
    'scala','sh','bash','zsh','ps1','sql','r','lua','dart','ex','exs','clj','hs','ml','fs',
    'html','css','scss','sass','less','vue','svelte','json','yaml','yml','toml','ini','env',
    'md','txt','xml','csv','graphql','proto','conf','cfg',
  ])
  const IAC_EXTS = new Set([
    'tf','tfvars','bicep','json','yaml','yml','toml','env','ini','conf',
    'sh','bash','ps1','dockerfile','containerfile','hcl','xml','properties',
  ])

  const isTextFile = (filename: string, allowedExts: Set<string>) => {
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    return allowedExts.has(ext)
  }

  const shouldSkipPath = (relativePath: string) => {
    return relativePath.split('/').some((segment) => SKIP_DIRS.has(segment))
  }

  const readFiles = async (files: File[], useRelativePath = false): Promise<ArtifactItem[]> =>
    Promise.all(
      files.map(async (f) => ({
        filename: useRelativePath && f.webkitRelativePath ? f.webkitRelativePath : f.name,
        content: await f.text(),
      }))
    )

  const persistToVolumeHandler = async (files: File[], type: 'code' | 'iac') => {
    if (!persistToVolume) return
    setPersistSaving(true)
    try {
      const sub = persistSubfolder.trim() || form.project_name.trim().replace(/\s+/g, '_').toLowerCase() || undefined
      const { data } = await artifactsApi.uploadToVolume(files, type, sub)
      const folder = type === 'code' ? data.volume_code_folder : data.volume_iac_folder
      setPersistedFolders((prev) => ({ ...prev, [type]: folder }))
      const skippedMsg = data.skipped.length > 0 ? ` (${data.skipped.length} skipped)` : ''
      toast.success(`${data.saved.length} ${type} file(s) saved to volume${skippedMsg}`)
    } catch (err: any) {
      toast.error(`Volume save failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setPersistSaving(false)
    }
  }

  const onDropCode = useCallback(async (files: File[]) => {
    const artifacts = await readFiles(files)
    setForm((prev) => ({ ...prev, code_artifacts: [...prev.code_artifacts, ...artifacts] }))
    toast.success(`${files.length} code file(s) added`)
    await persistToVolumeHandler(files, 'code')
  }, [persistToVolume, persistSubfolder, form.project_name])

  const onDropIaC = useCallback(async (files: File[]) => {
    const artifacts = await readFiles(files)
    setForm((prev) => ({ ...prev, iac_artifacts: [...prev.iac_artifacts, ...artifacts] }))
    toast.success(`${files.length} IaC file(s) added`)
    await persistToVolumeHandler(files, 'iac')
  }, [persistToVolume, persistSubfolder, form.project_name])

  const onFolderCode = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? [])
    const filtered = all.filter(
      (f) => !shouldSkipPath(f.webkitRelativePath) && isTextFile(f.name, CODE_EXTS)
    )
    if (!filtered.length) {
      toast.error('No supported code files found in the selected folder')
      e.target.value = ''
      return
    }
    const skipped = all.length - filtered.length
    const artifacts = await readFiles(filtered, true)
    setForm((prev) => ({ ...prev, code_artifacts: [...prev.code_artifacts, ...artifacts] }))
    toast.success(`${filtered.length} code file(s) added${skipped > 0 ? ` (${skipped} binary/ignored skipped)` : ''}`)
    await persistToVolumeHandler(filtered, 'code')
    e.target.value = ''
  }, [persistToVolume, persistSubfolder, form.project_name])

  const onFolderIaC = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? [])
    const filtered = all.filter(
      (f) => !shouldSkipPath(f.webkitRelativePath) && isTextFile(f.name, IAC_EXTS)
    )
    if (!filtered.length) {
      toast.error('No supported IaC files found in the selected folder')
      e.target.value = ''
      return
    }
    const skipped = all.length - filtered.length
    const artifacts = await readFiles(filtered, true)
    setForm((prev) => ({ ...prev, iac_artifacts: [...prev.iac_artifacts, ...artifacts] }))
    toast.success(`${filtered.length} IaC file(s) added${skipped > 0 ? ` (${skipped} binary/ignored skipped)` : ''}`)
    await persistToVolumeHandler(filtered, 'iac')
    e.target.value = ''
  }, [persistToVolume, persistSubfolder, form.project_name])

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
    const selectedTypes = form.analysis_types
    const progress: Record<string, 'pending' | 'running' | 'done' | 'skipped'> = {}

    // Mark each agent as pending (if selected) or skipped (if not)
    AGENT_NAMES.forEach(({ key }) => {
      const isSelected = selectedTypes.includes('all') || selectedTypes.includes(key)
      progress[key] = isSelected ? 'pending' : 'skipped'
    })
    setAgentProgress({ ...progress })
    setAnalyzing(true)

    // Run only selected agents sequentially
    const activeAgents = AGENT_NAMES.map((a) => a.key).filter((k) => progress[k] === 'pending')
    for (const agent of activeAgents) {
      progress[agent] = 'running'
      setAgentProgress({ ...progress })
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 600))
      progress[agent] = 'done'
      setAgentProgress({ ...progress })
    }

    // Brief pause for synthesis
    await new Promise((r) => setTimeout(r, 600))
  }

  const handleBlobUpload = useCallback(async (files: File[], artifactType: 'code' | 'iac') => {
    if (!files.length) return
    setBlobUploading(true)
    try {
      const uploaded: BlobArtifactRef[] = []
      for (const file of files) {
        const { data } = await artifactsApi.presign({ filename: file.name, artifact_type: artifactType })
        await artifactsApi.uploadDirect(data.upload_url, file)
        uploaded.push({ key: data.key, filename: file.name, artifact_type: artifactType })
      }
      setBlobArtifacts((prev) => [...prev, ...uploaded])
      toast.success(`${uploaded.length} ${artifactType} file(s) uploaded to storage`)
    } catch (err: any) {
      toast.error(err.message || 'Upload to object storage failed')
    } finally {
      setBlobUploading(false)
    }
  }, [])

  const removeBlobArtifact = (key: string) => {
    setBlobArtifacts((prev) => prev.filter((a) => a.key !== key))
    artifactsApi.delete(key).catch(() => {})
  }

  // Build source_config for volume/github/devops modes, or undefined for upload mode
  const buildSourceConfig = () => {
    if (artifactSource === 'blob') {
      return { type: 'blob' as const, artifacts: blobArtifacts }
    }
    if (artifactSource === 'volume') {
      return { type: 'volume' as const, code_folder: volumeConfig.codeFolder, iac_folder: volumeConfig.iacFolder }
    }
    if (artifactSource === 'github') {
      const g = repoConfig.github
      return { type: 'github' as const, repo_url: g.repoUrl, branch: g.branch, token: g.token || undefined, code_folder: g.codeFolder, iac_folder: g.iacFolder }
    }
    if (artifactSource === 'devops') {
      const d = repoConfig.devops
      return { type: 'devops' as const, org_url: d.orgUrl, project: d.project, repo: d.repo, branch: d.branch, token: d.token, code_folder: d.codeFolder, iac_folder: d.iacFolder }
    }
    return undefined
  }

  const handleSubmit = async () => {
    if (!form.project_name.trim()) {
      toast.error('Project name is required')
      return
    }
    const sourceConfig = buildSourceConfig()
    const hasInline = form.code_artifacts.length > 0 || form.iac_artifacts.length > 0
    if (!sourceConfig && !hasInline) {
      toast.error('Please upload at least one code or IaC file, or configure a source')
      return
    }
    if (artifactSource === 'blob' && blobArtifacts.length === 0) {
      toast.error('Upload at least one file to object storage before starting analysis')
      return
    }
    // Basic validation for each source type
    if (artifactSource === 'github' && !repoConfig.github.repoUrl) {
      toast.error('GitHub repository URL is required')
      return
    }
    if (artifactSource === 'devops' && (!repoConfig.devops.orgUrl || !repoConfig.devops.project || !repoConfig.devops.repo)) {
      toast.error('Azure DevOps org URL, project and repository are required')
      return
    }

    setLoading(true)
    try {
      // Show agent progress animation
      await runAgentAnimation()

      const payload = { ...form, source_config: sourceConfig, mcp_servers: mcpServers }
      const demo = await isDemoMode()
      if (demo) {
        // Demo mode: quickScan returns a full mock report immediately
        const { data } = await analysisApi.quickScan(payload)
        toast.success('Analysis complete!')
        navigate(`/report/${data.session_id}`, { state: { report: data } })
      } else {
        // Real backend: start async analysis and navigate to report page for polling
        const { data } = await analysisApi.start(payload)
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
          {(() => {
            const active = AGENT_NAMES.filter(({ key }) => agentProgress[key] !== 'skipped')
            return (
              <p className="text-gray-400 text-sm">
                {active.length} specialist agent{active.length !== 1 ? 's' : ''} analyzing your project...
              </p>
            )
          })()}
        </div>

        <div className="w-full max-w-md space-y-3">
          {AGENT_NAMES.map(({ key, label, icon: Icon }) => {
            const status = agentProgress[key] ?? 'pending'
            const isSkipped = status === 'skipped'
            return (
              <div
                key={key}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-500',
                  isSkipped
                    ? 'border-gray-800/50 bg-gray-900/40 opacity-40'
                    : status === 'done'
                    ? 'border-green-800 bg-green-900/20'
                    : status === 'running'
                    ? 'border-blue-600 bg-blue-900/20 animate-pulse'
                    : 'border-gray-800 bg-gray-900'
                )}
              >
                <Icon className={clsx(
                  'w-4 h-4',
                  isSkipped ? 'text-gray-700' : status === 'done' ? 'text-green-400' : status === 'running' ? 'text-blue-400' : 'text-gray-600'
                )} />
                <span className={clsx(
                  'text-sm font-medium flex-1',
                  isSkipped ? 'text-gray-700' : status === 'done' ? 'text-green-300' : status === 'running' ? 'text-blue-300' : 'text-gray-500'
                )}>
                  {label}
                  {isSkipped && <span className="ml-2 text-[10px] font-normal text-gray-700">not selected</span>}
                </span>
                {status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                {status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          Synthesizing results with Claude claude-opus-4-6...
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
            <label className="block text-sm text-gray-400 mb-1.5">Monthly Cost (EUR approx.)</label>
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
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">2. Analysis Scope</h2>
          <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
            MVP — Code &amp; Infra only
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* ALL button — disabled in MVP */}
          <div
            className="col-span-3 p-4 rounded-lg border border-gray-800 bg-gray-800/40 text-left opacity-40 cursor-not-allowed select-none"
            title="Coming soon — Full Analysis will be available in a future release"
          >
            <div className="font-medium text-sm text-gray-500">Full Analysis (All Agents)</div>
            <div className="text-xs mt-1 text-gray-600">Coming soon — select agents individually</div>
          </div>

          {ANALYSIS_TYPES.map(({ value, label, icon: Icon, desc, mvp }) => {
            const isSelected = form.analysis_types.includes(value)
            if (!mvp) {
              return (
                <div
                  key={value}
                  className="relative p-4 rounded-lg border border-gray-800/50 bg-gray-800/20 text-left opacity-40 cursor-not-allowed select-none"
                  title="Coming soon"
                >
                  <Icon className="w-5 h-5 mb-2 text-gray-700" />
                  <div className="font-medium text-sm text-gray-600">{label}</div>
                  <div className="text-xs mt-1 text-gray-700">{desc}</div>
                  <span className="absolute top-2 right-2 text-[9px] font-semibold text-gray-600 uppercase tracking-wider">
                    Soon
                  </span>
                </div>
              )
            }
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleAnalysisType(value)}
                className={clsx(
                  'p-4 rounded-lg border text-left transition-all',
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                )}
              >
                <Icon className="w-5 h-5 mb-2" />
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs mt-1 opacity-70">{desc}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Artifacts Source */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="font-semibold text-white">3. Artifact Source</h2>

        {/* Source tabs */}
        <div className="flex flex-wrap gap-1 bg-gray-800 rounded-lg p-1 w-fit">
          {([
            { key: 'upload',  label: 'File Upload',     icon: FolderGit2 },
            { key: 'blob',    label: 'Object Storage',  icon: Database   },
            { key: 'volume',  label: 'Local Volume',    icon: HardDrive  },
            { key: 'github',  label: 'GitHub',          icon: Github     },
            { key: 'devops',  label: 'Azure DevOps',    icon: Link2      },
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

        {/* -- File Upload -- */}
        {artifactSource === 'upload' && (<>
          <div className="grid grid-cols-2 gap-4">
            {/* Code drop zone */}
            <div className="space-y-2">
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
              <input
                ref={codeFolderInputRef}
                type="file"
                className="hidden"
                onChange={onFolderCode}
                multiple
                {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
              />
              <button
                type="button"
                onClick={() => codeFolderInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Add Code Folder
              </button>
            </div>

            {/* IaC drop zone */}
            <div className="space-y-2">
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
              <input
                ref={iacFolderInputRef}
                type="file"
                className="hidden"
                onChange={onFolderIaC}
                multiple
                {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
              />
              <button
                type="button"
                onClick={() => iacFolderInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Add IaC Folder
              </button>
            </div>
          </div>

          {/* -- Persist to Volume toggle -- */}
          <div className={clsx(
            'rounded-xl border p-4 space-y-3 transition-colors',
            persistToVolume ? 'border-green-700/60 bg-green-900/10' : 'border-gray-700 bg-gray-800/40'
          )}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setPersistToVolume((v) => !v)}
                className={clsx(
                  'relative w-10 h-5 rounded-full transition-colors',
                  persistToVolume ? 'bg-green-600' : 'bg-gray-600'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                  persistToVolume ? 'translate-x-5' : 'translate-x-0.5'
                )} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-200">Persist files to Docker volume</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Saves a copy to <code className="bg-gray-700 px-1 rounded">/app/uploads</code> — reusable via the <strong>Local Volume</strong> tab without re-uploading
                </div>
              </div>
              {persistSaving && <Loader2 className="w-4 h-4 animate-spin text-green-400 ml-auto" />}
            </label>

            {persistToVolume && (
              <div className="space-y-2">
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="Subfolder name (default: project name)"
                  value={persistSubfolder}
                  onChange={(e) => setPersistSubfolder(e.target.value)}
                />
                {(persistedFolders.code || persistedFolders.iac) && (
                  <div className="flex flex-col gap-1 text-xs text-green-400 bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2">
                    <span className="font-medium">Saved to volume:</span>
                    {persistedFolders.code && <span>Code → <code className="text-green-300">{persistedFolders.code}</code></span>}
                    {persistedFolders.iac  && <span>IaC  → <code className="text-green-300">{persistedFolders.iac}</code></span>}
                    <span className="text-gray-500 mt-1">Use these paths in the Local Volume tab for future analyses.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>)}

        {/* -- Object Storage (MinIO / Azure Blob) -- */}
        {artifactSource === 'blob' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-blue-900/20 border border-blue-800/50 rounded-lg px-4 py-3 text-sm text-blue-300">
              <Database className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Files are uploaded directly from your browser to <strong>MinIO</strong> (local) or <strong>Azure Blob Storage</strong> (production) via a presigned URL — they never pass through the backend. Configure <code className="bg-gray-800 px-1 rounded">STORAGE_BACKEND=minio</code> and start MinIO before using this tab.
              </span>
            </div>

            {/* Upload buttons */}
            <div className="grid grid-cols-2 gap-4">
              {/* Code files → MinIO */}
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Code Files</label>
                <label className={clsx(
                  'flex items-center justify-center gap-2 w-full px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
                  blobUploading ? 'opacity-50 cursor-not-allowed border-gray-700' : 'border-gray-700 hover:border-blue-500 hover:bg-blue-500/5'
                )}>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={blobUploading}
                    onChange={(e) => handleBlobUpload(Array.from(e.target.files ?? []), 'code')}
                  />
                  {blobUploading
                    ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    : <Upload className="w-5 h-5 text-gray-500" />}
                  <span className="text-sm text-gray-400">{blobUploading ? 'Uploading...' : 'Select Code Files'}</span>
                </label>
              </div>

              {/* IaC files → MinIO */}
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">IaC Files</label>
                <label className={clsx(
                  'flex items-center justify-center gap-2 w-full px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
                  blobUploading ? 'opacity-50 cursor-not-allowed border-gray-700' : 'border-gray-700 hover:border-blue-500 hover:bg-blue-500/5'
                )}>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={blobUploading}
                    onChange={(e) => handleBlobUpload(Array.from(e.target.files ?? []), 'iac')}
                  />
                  {blobUploading
                    ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    : <Upload className="w-5 h-5 text-gray-500" />}
                  <span className="text-sm text-gray-400">{blobUploading ? 'Uploading...' : 'Select IaC Files'}</span>
                </label>
              </div>
            </div>

            {/* Uploaded artifact list */}
            {blobArtifacts.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-400 font-medium">{blobArtifacts.length} file(s) in storage</div>
                <div className="flex flex-wrap gap-2">
                  {blobArtifacts.map((a) => (
                    <span
                      key={a.key}
                      className={clsx(
                        'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md',
                        a.artifact_type === 'code'
                          ? 'bg-blue-900/30 text-blue-300 border border-blue-800/50'
                          : 'bg-orange-900/30 text-orange-300 border border-orange-800/50'
                      )}
                    >
                      <span className="opacity-60">{a.artifact_type === 'code' ? '〈/〉' : '⚙'}</span>
                      {a.filename}
                      <button
                        onClick={() => removeBlobArtifact(a.key)}
                        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* -- Local Volume -- */}
        {artifactSource === 'volume' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-800/50 rounded-lg px-4 py-3 text-sm text-amber-300">
              <HardDrive className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Mount a local directory into the container at <code className="bg-gray-800 px-1 rounded">/app/uploads</code> via <code className="bg-gray-800 px-1 rounded">compose.yml</code>, then specify the sub-folders below. Leave blank to scan the volume root.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Code folder <span className="text-gray-600">(relative to /app/uploads)</span></label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="myproject/src  (blank = root)"
                  value={volumeConfig.codeFolder}
                  onChange={(e) => setVolumeConfig((p) => ({ ...p, codeFolder: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">IaC folder <span className="text-gray-600">(relative to /app/uploads)</span></label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="myproject/infra  (blank = root)"
                  value={volumeConfig.iacFolder}
                  onChange={(e) => setVolumeConfig((p) => ({ ...p, iacFolder: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              Files will be read server-side at analysis start — binary files and noise dirs are auto-skipped.
            </div>
          </div>
        )}

        {/* -- GitHub -- */}
        {artifactSource === 'github' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Repository URL *</label>
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
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Personal Access Token <span className="text-gray-600">(required for private repos)</span></label>
              <input
                type="password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={repoConfig.github.token}
                onChange={(e) => setRepoConfig((p) => ({ ...p, github: { ...p.github, token: e.target.value } }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Code folder <span className="text-gray-600">(optional)</span></label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="src/  (blank = repo root)"
                  value={repoConfig.github.codeFolder}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, github: { ...p.github, codeFolder: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">IaC folder <span className="text-gray-600">(optional)</span></label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="infra/  (blank = repo root)"
                  value={repoConfig.github.iacFolder}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, github: { ...p.github, iacFolder: e.target.value } }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              Repository will be shallow-cloned server-side at analysis start (depth 1). Credentials are never stored.
            </div>
          </div>
        )}

        {/* -- Azure DevOps -- */}
        {artifactSource === 'devops' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Organization URL *</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://dev.azure.com/my-org"
                  value={repoConfig.devops.orgUrl}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, orgUrl: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Project *</label>
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
                <label className="block text-sm text-gray-400 mb-1.5">Repository Name *</label>
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
              <label className="block text-sm text-gray-400 mb-1.5">Personal Access Token (PAT) * <span className="text-gray-600">— scope: Code (read)</span></label>
              <input
                type="password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="PAT with Code (read) scope"
                value={repoConfig.devops.token}
                onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, token: e.target.value } }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Code folder <span className="text-gray-600">(optional)</span></label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="src/  (blank = repo root)"
                  value={repoConfig.devops.codeFolder}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, codeFolder: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">IaC folder <span className="text-gray-600">(optional)</span></label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="infra/  (blank = repo root)"
                  value={repoConfig.devops.iacFolder}
                  onChange={(e) => setRepoConfig((p) => ({ ...p, devops: { ...p.devops, iacFolder: e.target.value } }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              Repository will be shallow-cloned server-side at analysis start (depth 1). Credentials are never stored.
            </div>
          </div>
        )}
      </section>

      {/* MCP Enrichment Sources */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-white">4. MCP Enrichment Sources</h2>
            <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">Beta</span>
          </div>
          <span className="text-xs text-gray-500">Anthropic mode only · Phase 1.5</span>
        </div>

        <div className="flex items-start gap-2 bg-purple-900/20 border border-purple-800/40 rounded-lg px-4 py-3 text-xs text-purple-300">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            When enabled, a dedicated <strong>MCP Enrichment Agent</strong> (Phase 1.5) calls Azure Skills
            to retrieve real Azure intelligence — migration readiness, actual pricing, Advisor recommendations,
            WAF assessment, reference architectures — and injects it into the final report.
            Requires <strong>docker compose --profile mcp up</strong> to start the internal MCP services.
          </span>
        </div>

        {/* ── Azure Skills (Pre-configured internal services) ──────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">🔵 Azure Skills</span>
            <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">Pre-configured · docker compose --profile mcp up</span>
          </div>

          {PRECONFIGURED_MCP_SERVERS.map((preset) => {
            const srv = mcpServers.find((s) => s.id === preset.id) ?? preset
            const skillsMap = srv.id === 'azure-mcp-internal' ? AZURE_SKILLS_BY_CATEGORY : DEVOPS_SKILLS_BY_CATEGORY
            const isExpanded = expandedSkills[srv.id] ?? false
            const skillCount = Object.values(skillsMap).flat().length
            return (
              <div
                key={srv.id}
                className={clsx(
                  'rounded-xl border p-4 transition-colors',
                  srv.enabled
                    ? 'border-blue-600/50 bg-blue-900/10'
                    : 'border-gray-700 bg-gray-800/30'
                )}
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Zap className={clsx('w-4 h-4', srv.enabled ? 'text-blue-400' : 'text-gray-600')} />
                    <span className={clsx('font-medium text-sm', srv.enabled ? 'text-white' : 'text-gray-400')}>
                      {srv.name}
                    </span>
                    <span className="text-[9px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded uppercase">
                      Pre-configured
                    </span>
                    <span className="text-[9px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                      {skillCount} skills
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedSkills((p) => ({ ...p, [srv.id]: !isExpanded }))}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {isExpanded ? 'Hide skills ▲' : 'View skills ▼'}
                    </button>
                    {/* Toggle */}
                    <div
                      onClick={() => setMcpServers((prev) => prev.map((s) => s.id === srv.id ? { ...s, enabled: !s.enabled } : s))}
                      className={clsx(
                        'relative w-9 h-5 rounded-full cursor-pointer transition-colors',
                        srv.enabled ? 'bg-blue-600' : 'bg-gray-600'
                      )}
                    >
                      <span className={clsx(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        srv.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </div>
                  </div>
                </div>

                {/* URL note */}
                <div className="mt-2 text-[10px] text-gray-600">
                  {srv.id === 'azure-mcp-internal'
                    ? 'Internal: http://mcp-azure:3333/sse · Azure Service Principal required (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)'
                    : 'Internal: http://mcp-devops:3334/sse · PAT required (AZURE_DEVOPS_ORG, AZURE_DEVOPS_EXT_PAT) · Note: remote https://mcp.dev.azure.com requires Entra OAuth (not yet supported by Anthropic API)'}
                </div>

                {/* Skills grid (expandable) */}
                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(skillsMap).map(([category, skills]) => (
                      <div key={category}>
                        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{category}</div>
                        <div className="flex flex-wrap gap-1">
                          {skills.map((skill) => (
                            <span key={skill} className="text-[10px] text-blue-300/70 bg-blue-900/20 border border-blue-800/30 px-1.5 py-0.5 rounded font-mono">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Custom / External Servers ─────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Custom / External Servers</div>
          {Object.entries(MCP_CLOUD_LABELS)
            .filter(([cloud]) => cloud === 'aws' || cloud === 'gcp')
            .map(([cloud, label]) => {
              const servers = mcpServers.filter((s) => s.cloud === cloud && !s.preconfigured)
              if (!servers.length) return null
              return (
                <div key={cloud} className="space-y-1.5">
                  <div className="text-[11px] text-gray-600">{cloud === 'aws' ? '☁️' : '🔶'} {label}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {servers.map((srv) => (
                      <div
                        key={srv.id}
                        className={clsx(
                          'rounded-lg border p-3 transition-colors',
                          srv.enabled ? 'border-purple-600/40 bg-purple-900/20' : 'border-gray-700 bg-gray-800/40'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Zap className={clsx('w-3 h-3', srv.enabled ? 'text-purple-400' : 'text-gray-600')} />
                            <span className={clsx('text-xs font-medium', srv.enabled ? 'text-white' : 'text-gray-500')}>{srv.name}</span>
                            <span className="text-[8px] font-semibold text-gray-500 bg-gray-700 border border-gray-600 px-1 py-0.5 rounded uppercase">{srv.type}</span>
                          </div>
                          <div
                            onClick={() => setMcpServers((prev) => prev.map((s) => s.id === srv.id ? { ...s, enabled: !s.enabled } : s))}
                            className={clsx('relative w-7 h-3.5 rounded-full cursor-pointer transition-colors', srv.enabled ? 'bg-purple-600' : 'bg-gray-600')}
                          >
                            <span className={clsx('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform', srv.enabled ? 'translate-x-3.5' : 'translate-x-0.5')} />
                          </div>
                        </div>
                        {srv.type === 'url' ? (
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                            placeholder="https://your-mcp-server.example.com/sse"
                            value={srv.url ?? ''}
                            onChange={(e) => setMcpServers((prev) => prev.map((s) => s.id === srv.id ? { ...s, url: e.target.value } : s))}
                          />
                        ) : (
                          <div className="text-[10px] text-gray-600 mt-1">Requires local process — convert to URL endpoint to activate</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
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
