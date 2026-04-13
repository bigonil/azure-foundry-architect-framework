import { useState } from 'react';
import { Upload, Github, Play, AlertCircle, CheckCircle, Clock, Code, Zap, Shield, FileCode, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PerformanceReport {
  project_name: string;
  status: string;
  total_duration_seconds: number;
  total_tokens: {
    input: number;
    output: number;
  };
  total_cost_eur: number;
  phases: {
    architect?: PhaseResult;
    coder?: PhaseResult;
    optimizer?: OptimizerPhase;
    validator?: PhaseResult;
  };
}

interface PhaseResult {
  status: string;
  duration_seconds: number;
  data: any;
  tokens: {
    input: number;
    output: number;
  };
  cost_eur: number;
}

interface OptimizerPhase {
  iterations: PhaseResult[];
  total_iterations: number;
  targets_met: boolean;
  final_code: any;
}

export default function PerformancePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'upload' | 'github'>('github');
  const [repoUrl, setRepoUrl] = useState('https://github.com/Dynatrace/easytrade.git');
  const [branch, setBranch] = useState('main');
  const [projectName, setProjectName] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const startAnalysis = async () => {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const body: any = {
        project_name: projectName || 'Performance Analysis',
        source_cloud: 'aws',
        target_cloud: 'azure',
      };

      if (sourceType === 'github') {
        body.source_config = {
          type: 'github',
          repo_url: repoUrl,
          branch: branch,
        };
      } else if (sourceType === 'upload') {
        // Upload mode: read files and send as code_artifacts
        if (uploadedFiles.length === 0) {
          throw new Error('Seleziona almeno un file da analizzare');
        }

        const artifacts = await Promise.all(
          uploadedFiles.map(async (file) => {
            const content = await file.text();
            return {
              filename: file.name,
              content: content,
              encoding: 'utf-8',
            };
          })
        );

        body.code_artifacts = artifacts;
      }

      const response = await fetch('http://localhost:8000/api/performance/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to start analysis');
      }

      const data = await response.json();
      setSessionId(data.session_id);
      pollStatus(data.session_id);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const pollStatus = async (sid: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/performance/${sid}/status`);
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          fetchReport(sid);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setError(data.error || 'Analysis failed');
          setLoading(false);
        }
      } catch (err: any) {
        clearInterval(interval);
        setError(err.message);
        setLoading(false);
      }
    }, 3000);
  };

  const fetchReport = async (sid: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/performance/${sid}`);
      if (!response.ok) throw new Error('Failed to fetch report');
      const data = await response.json();
      setReport(data);
      setLoading(false);
      // Naviga automaticamente al report dettagliato
      navigate(`/performance/report/${sid}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Zap className="w-10 h-10 text-yellow-400" />
            Analisi Performance & Refactoring
          </h1>
          <p className="text-slate-300 text-lg">
            Sistema multi-agente per analisi, refactoring, ottimizzazione e validazione del codice
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-8 border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-white mb-2 font-medium">Nome Progetto</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="es. My Application"
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-white mb-2 font-medium">Sorgente Codice</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSourceType('github')}
                  className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition ${
                    sourceType === 'github'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  <Github className="w-4 h-4" />
                  GitHub
                </button>
                <button
                  onClick={() => setSourceType('upload')}
                  className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition ${
                    sourceType === 'upload'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
              </div>
            </div>
          </div>

          {sourceType === 'github' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="md:col-span-2">
                <label className="block text-white mb-2 font-medium">Repository URL</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-white mb-2 font-medium">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          )}

          {sourceType === 'upload' && (
            <div className="mb-6">
              <label className="block text-white mb-2 font-medium">Carica File di Codice</label>
              <div className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center">
                <input
                  type="file"
                  multiple
                  accept=".py,.js,.ts,.tsx,.jsx,.java,.cpp,.c,.h,.cs,.go,.rb,.php,.swift,.kt"
                  onChange={(e) => {
                    if (e.target.files) {
                      setUploadedFiles(Array.from(e.target.files));
                    }
                  }}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-12 h-12 text-purple-400" />
                  <span className="text-white font-medium">
                    Clicca per selezionare i file
                  </span>
                  <span className="text-slate-400 text-sm">
                    Supportati: .py, .js, .ts, .java, .cpp, .go, .rb, .php, ecc.
                  </span>
                </label>
              </div>
              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-white font-medium">{uploadedFiles.length} file selezionati:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {uploadedFiles.map((file, i) => (
                      <div key={i} className="bg-white/5 rounded px-3 py-2 text-sm text-slate-300 flex items-center justify-between">
                        <span>{file.name}</span>
                        <span className="text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={startAnalysis}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Clock className="w-5 h-5 animate-spin" />
                Analisi in corso...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Avvia Analisi Performance
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-8 flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-400 font-semibold mb-1">Errore</h3>
              <p className="text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-green-400" />
                Analisi Completata
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">Durata</p>
                  <p className="text-white text-xl font-semibold">
                    {report.total_duration_seconds.toFixed(1)}s
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Token Usati</p>
                  <p className="text-white text-xl font-semibold">
                    {(report.total_tokens.input + report.total_tokens.output).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Costo</p>
                  <p className="text-white text-xl font-semibold">€{report.total_cost_eur.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Status</p>
                  <p className="text-green-400 text-xl font-semibold capitalize">{report.status}</p>
                </div>
              </div>
            </div>

            {/* Phase 1: Architect */}
            {report.phases.architect && (
              <PhaseCard
                title="1. Architect — Analisi & Dipendenze"
                icon={<Code className="w-6 h-6" />}
                phase={report.phases.architect}
                color="blue"
              >
                <ArchitectResults data={report.phases.architect.data} />
              </PhaseCard>
            )}

            {/* Phase 2: Coder */}
            {report.phases.coder && (
              <PhaseCard
                title="2. Coder — Trasformazione Codice"
                icon={<FileCode className="w-6 h-6" />}
                phase={report.phases.coder}
                color="green"
              >
                <CoderResults data={report.phases.coder.data} />
              </PhaseCard>
            )}

            {/* Phase 3: Optimizer */}
            {report.phases.optimizer && (
              <PhaseCard
                title="3. Optimizer — Ottimizzazione Performance"
                icon={<Zap className="w-6 h-6" />}
                phase={report.phases.optimizer.iterations[report.phases.optimizer.iterations.length - 1]}
                color="yellow"
              >
                <OptimizerResults data={report.phases.optimizer} />
              </PhaseCard>
            )}

            {/* Phase 4: Validator */}
            {report.phases.validator && (
              <PhaseCard
                title="4. Validator — Sicurezza & Testing"
                icon={<Shield className="w-6 h-6" />}
                phase={report.phases.validator}
                color="purple"
              >
                <ValidatorResults data={report.phases.validator.data} />
              </PhaseCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Component per visualizzare una fase
function PhaseCard({ title, icon, phase, color, children }: any) {
  const colorClasses = {
    blue: 'from-blue-600 to-cyan-600',
    green: 'from-green-600 to-emerald-600',
    yellow: 'from-yellow-600 to-orange-600',
    purple: 'from-purple-600 to-pink-600',
  };

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden">
      <div className={`bg-gradient-to-r ${colorClasses[color]} p-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="text-xl font-bold text-white">{title}</h3>
        </div>
        <div className="text-white text-sm">
          {phase.duration_seconds?.toFixed(1)}s • {phase.tokens?.input + phase.tokens?.output} tokens
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// Risultati Architect
function ArchitectResults({ data }: any) {
  const refactorings = data.refactoring_opportunities || [];
  const codeSmells = data.code_smells || [];
  const solidScore = data.solid_assessment || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Refactoring Opportunities</p>
          <p className="text-white text-2xl font-bold">{refactorings.length}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Code Smells</p>
          <p className="text-white text-2xl font-bold">{codeSmells.length}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Maintainability Score</p>
          <p className="text-white text-2xl font-bold">{data.overall_maintainability_score || 0}/10</p>
        </div>
      </div>

      {refactorings.length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-2">Top Refactoring Opportunities</h4>
          <div className="space-y-2">
            {refactorings.slice(0, 3).map((ref: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium">{ref.file}</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    ref.priority === 'CRITICAL' ? 'bg-red-500' :
                    ref.priority === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'
                  }`}>
                    {ref.priority}
                  </span>
                </div>
                <p className="text-slate-300 text-sm">{ref.current_structure}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Risultati Coder
function CoderResults({ data }: any) {
  const refactoredFiles = data.refactored_files || [];

  return (
    <div className="space-y-4">
      <div className="bg-white/5 rounded-lg p-4">
        <p className="text-slate-400 text-sm">File Refactorizzati</p>
        <p className="text-white text-2xl font-bold">{refactoredFiles.length}</p>
      </div>

      {refactoredFiles.length > 0 && (
        <div className="space-y-2">
          {refactoredFiles.slice(0, 3).map((file: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-lg p-3">
              <p className="text-white font-medium">{file.original_file}</p>
              <p className="text-slate-300 text-sm">→ {file.new_files?.length || 0} nuovi file</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Risultati Optimizer
function OptimizerResults({ data }: any) {
  const lastIteration = data.iterations[data.iterations.length - 1];
  const optimizations = lastIteration?.data?.performance_analysis || [];
  const quickWins = lastIteration?.data?.quick_wins || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Iterazioni</p>
          <p className="text-white text-2xl font-bold">{data.total_iterations}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Ottimizzazioni</p>
          <p className="text-white text-2xl font-bold">{optimizations.length}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Target Raggiunti</p>
          <p className={`text-2xl font-bold ${data.targets_met ? 'text-green-400' : 'text-yellow-400'}`}>
            {data.targets_met ? 'Sì' : 'No'}
          </p>
        </div>
      </div>

      {quickWins.length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-2">Quick Wins</h4>
          <div className="space-y-2">
            {quickWins.map((win: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-3">
                <p className="text-white font-medium">{win.optimization}</p>
                <p className="text-green-400 text-sm">{win.impact}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Risultati Validator
function ValidatorResults({ data }: any) {
  const securityFindings = data.security_findings || [];
  const generatedTests = data.generated_tests || [];
  const criticalIssues = securityFindings.filter((f: any) => f.severity === 'CRITICAL').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Security Issues</p>
          <p className="text-white text-2xl font-bold">{securityFindings.length}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Critical Issues</p>
          <p className="text-red-400 text-2xl font-bold">{criticalIssues}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Test Generati</p>
          <p className="text-white text-2xl font-bold">{generatedTests.length}</p>
        </div>
      </div>

      {securityFindings.length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-2">Top Security Issues</h4>
          <div className="space-y-2">
            {securityFindings.slice(0, 3).map((finding: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium">{finding.category}</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    finding.severity === 'CRITICAL' ? 'bg-red-500' :
                    finding.severity === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'
                  }`}>
                    {finding.severity}
                  </span>
                </div>
                <p className="text-slate-300 text-sm">{finding.vulnerability}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
