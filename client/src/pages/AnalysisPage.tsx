import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import {
  Upload, Play, Cloud, Code2, Server, DollarSign,
  GitBranch, BarChart3, Shield, ChevronRight, Loader2,
} from 'lucide-react'
import { analysisApi, type AnalysisRequest, type ArtifactItem } from '../services/api'

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
]

export default function AnalysisPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

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
      const hasMany = form.code_artifacts.length + form.iac_artifacts.length > 5
      if (hasMany) {
        const { data } = await analysisApi.start(form)
        toast.success('Analysis started! Redirecting to report...')
        navigate(`/report/${data.session_id}`)
      } else {
        const { data } = await analysisApi.quickScan(form)
        navigate(`/report/${data.session_id}`, { state: { report: data } })
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const allSelected = form.analysis_types.includes('all')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">New Analysis</h1>
        <p className="text-gray-400 mt-1">
          Upload your code and IaC artifacts to start a multi-agent architecture analysis.
        </p>
      </div>

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

      {/* File Upload */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="font-semibold text-white">3. Upload Artifacts</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Code Files */}
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
              <div className="mt-3 text-xs text-blue-400">{form.code_artifacts.length} file(s) loaded</div>
            )}
          </div>

          {/* IaC Files */}
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
              <div className="mt-3 text-xs text-blue-400">{form.iac_artifacts.length} file(s) loaded</div>
            )}
          </div>
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
