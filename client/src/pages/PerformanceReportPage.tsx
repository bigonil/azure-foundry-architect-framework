import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Code, Zap, Shield, FileCode, 
  AlertTriangle, CheckCircle, TrendingUp, Clock, DollarSign,
  ChevronDown, ChevronRight
} from 'lucide-react';

interface PerformanceReport {
  project_name: string;
  status: string;
  total_duration_seconds: number;
  total_tokens: { input: number; output: number };
  total_cost_eur: number;
  executive_summary?: {
    introduzione: string;
    analisi_dettagliata: string;
    previsioni_miglioramenti: string;
    conclusioni_raccomandazioni: string;
    full_text: string;
  };
  phases: {
    architect?: any;
    coder?: any;
    optimizer?: any;
    validator?: any;
  };
}

export default function PerformanceReportPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['executive', 'summary']));

  useEffect(() => {
    fetchReport();
  }, [sessionId]);

  const fetchReport = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/performance/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch report');
      const data = await response.json();
      setReport(data);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${sessionId}.json`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Caricamento report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">{error || 'Report non trovato'}</div>
      </div>
    );
  }

  const architect = report.phases.architect?.data || {};
  const coder = report.phases.coder?.data || {};
  const optimizer = report.phases.optimizer?.iterations?.[report.phases.optimizer.iterations.length - 1]?.data || {};
  const validator = report.phases.validator?.data || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/performance')}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-4xl font-bold text-white flex items-center gap-3">
                <Zap className="w-10 h-10 text-yellow-400" />
                Report Performance
              </h1>
              <p className="text-slate-300 text-lg mt-1">{report.project_name}</p>
            </div>
          </div>
          <button
            onClick={downloadReport}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Scarica JSON
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Clock className="w-4 h-4" />
              Durata
            </div>
            <div className="text-white text-2xl font-bold">
              {report.total_duration_seconds.toFixed(1)}s
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Token Totali
            </div>
            <div className="text-white text-2xl font-bold">
              {(report.total_tokens.input + report.total_tokens.output).toLocaleString()}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Costo
            </div>
            <div className="text-white text-2xl font-bold">
              €{report.total_cost_eur.toFixed(4)}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <CheckCircle className="w-4 h-4" />
              Status
            </div>
            <div className="text-green-400 text-2xl font-bold capitalize">
              {report.status}
            </div>
          </div>
        </div>

        {/* Executive Summary Section */}
        {report.executive_summary && (
          <Section
            title="📊 Sintesi Esecutiva"
            icon={<TrendingUp className="w-6 h-6" />}
            color="indigo"
            expanded={expandedSections.has('executive')}
            onToggle={() => toggleSection('executive')}
          >
            <ExecutiveSummarySection data={report.executive_summary} />
          </Section>
        )}

        {/* Architect Section */}
        <Section
          title="1. Architect — Analisi Architettura"
          icon={<Code className="w-6 h-6" />}
          color="blue"
          expanded={expandedSections.has('architect')}
          onToggle={() => toggleSection('architect')}
        >
          <ArchitectSection data={architect} />
        </Section>

        {/* Coder Section */}
        <Section
          title="2. Coder — Codice Refactorizzato"
          icon={<FileCode className="w-6 h-6" />}
          color="green"
          expanded={expandedSections.has('coder')}
          onToggle={() => toggleSection('coder')}
        >
          <CoderSection data={coder} />
        </Section>

        {/* Optimizer Section */}
        <Section
          title="3. Optimizer — Ottimizzazioni Performance"
          icon={<Zap className="w-6 h-6" />}
          color="yellow"
          expanded={expandedSections.has('optimizer')}
          onToggle={() => toggleSection('optimizer')}
        >
          <OptimizerSection data={optimizer} />
        </Section>

        {/* Validator Section */}
        <Section
          title="4. Validator — Sicurezza e Testing"
          icon={<Shield className="w-6 h-6" />}
          color="purple"
          expanded={expandedSections.has('validator')}
          onToggle={() => toggleSection('validator')}
        >
          <ValidatorSection data={validator} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, color, expanded, onToggle, children }: any) {
  const colorClasses = {
    blue: 'from-blue-600 to-cyan-600',
    green: 'from-green-600 to-emerald-600',
    yellow: 'from-yellow-600 to-orange-600',
    purple: 'from-purple-600 to-pink-600',
  };

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden mb-6">
      <button
        onClick={onToggle}
        className={`w-full bg-gradient-to-r ${colorClasses[color]} p-4 flex items-center justify-between hover:opacity-90 transition`}
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="text-xl font-bold text-white">{title}</h3>
        </div>
        {expanded ? <ChevronDown className="w-5 h-5 text-white" /> : <ChevronRight className="w-5 h-5 text-white" />}
      </button>
      {expanded && <div className="p-6">{children}</div>}
    </div>
  );
}

function ExecutiveSummarySection({ data }: any) {
  const [activeTab, setActiveTab] = useState('full');

  const tabs = [
    { id: 'full', label: 'Sintesi Completa', icon: <FileCode className="w-4 h-4" /> },
    { id: 'intro', label: 'Introduzione', icon: <Code className="w-4 h-4" /> },
    { id: 'analysis', label: 'Analisi', icon: <Zap className="w-4 h-4" /> },
    { id: 'predictions', label: 'Previsioni', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'conclusions', label: 'Conclusioni', icon: <CheckCircle className="w-4 h-4" /> },
  ];

  const renderMarkdown = (text: string) => {
    // Semplice rendering di markdown per titoli, liste, e grassetto
    return text.split('\n').map((line, i) => {
      // Titoli
      if (line.startsWith('## ')) {
        return <h2 key={i} className="text-2xl font-bold text-white mt-6 mb-3">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} className="text-xl font-semibold text-blue-300 mt-4 mb-2">{line.replace('### ', '')}</h3>;
      }
      // Liste
      if (line.startsWith('- ')) {
        return <li key={i} className="text-slate-300 ml-4">{line.replace('- ', '')}</li>;
      }
      if (/^\d+\. /.test(line)) {
        return <li key={i} className="text-slate-300 ml-4">{line.replace(/^\d+\. /, '')}</li>;
      }
      // Grassetto
      const boldText = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
      // Linea orizzontale
      if (line.trim() === '---') {
        return <hr key={i} className="border-white/20 my-4" />;
      }
      // Testo normale
      if (line.trim()) {
        return <p key={i} className="text-slate-300 mb-2" dangerouslySetInnerHTML={{ __html: boldText }} />;
      }
      return <br key={i} />;
    });
  };

  const getContent = () => {
    switch (activeTab) {
      case 'intro':
        return data.introduzione;
      case 'analysis':
        return data.analisi_dettagliata;
      case 'predictions':
        return data.previsioni_miglioramenti;
      case 'conclusions':
        return data.conclusioni_raccomandazioni;
      default:
        return data.full_text;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <div className="prose prose-invert max-w-none">
          {renderMarkdown(getContent())}
        </div>
      </div>

      {/* Download Button */}
      <button
        onClick={() => {
          const blob = new Blob([data.full_text], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'executive-summary.md';
          a.click();
        }}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
      >
        <Download className="w-4 h-4" />
        Scarica Sintesi (Markdown)
      </button>
    </div>
  );
}

function ArchitectSection({ data }: any) {
  const refactorings = data.refactoring_opportunities || [];
  const codeSmells = data.code_smells || [];
  const solidAssessment = data.solid_assessment || {};

  return (
    <div className="space-y-6">
      {/* SOLID Assessment */}
      <div>
        <h4 className="text-white font-semibold text-lg mb-3">SOLID Principles Assessment</h4>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(solidAssessment).map(([principle, assessment]: any) => (
            <div key={principle} className="bg-white/5 rounded-lg p-3">
              <div className="text-slate-300 text-xs uppercase mb-1">{principle.replace('_', ' ')}</div>
              <div className={`text-sm font-semibold ${
                assessment.score === 'APPLIED' ? 'text-green-400' :
                assessment.score === 'PARTIAL' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {assessment.score}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Code Smells */}
      {codeSmells.length > 0 && (
        <div>
          <h4 className="text-white font-semibold text-lg mb-3">Code Smells Identificati ({codeSmells.length})</h4>
          <div className="space-y-3">
            {codeSmells.map((smell: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-4 border-l-4 border-orange-500">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    <span className="text-white font-medium">{smell.type}</span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    smell.severity === 'CRITICAL' ? 'bg-red-500' :
                    smell.severity === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'
                  }`}>
                    {smell.severity}
                  </span>
                </div>
                <div className="text-slate-400 text-sm mb-2">{smell.file || smell.class}</div>
                <div className="text-slate-300 text-sm mb-2">{smell.description}</div>
                <div className="text-green-400 text-sm">💡 {smell.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refactoring Opportunities */}
      {refactorings.length > 0 && (
        <div>
          <h4 className="text-white font-semibold text-lg mb-3">Opportunità di Refactoring ({refactorings.length})</h4>
          <div className="space-y-4">
            {refactorings.map((ref: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-white font-medium mb-1">{ref.file}</div>
                    <div className="text-slate-400 text-sm">{ref.current_structure}</div>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      ref.priority === 'CRITICAL' ? 'bg-red-500' :
                      ref.priority === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'
                    }`}>
                      {ref.priority}
                    </span>
                    <span className="px-2 py-1 rounded text-xs bg-blue-500">
                      {ref.effort_hours}h
                    </span>
                  </div>
                </div>
                
                {ref.issues && (
                  <div className="mb-3">
                    <div className="text-slate-400 text-sm mb-1">Problemi:</div>
                    <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                      {ref.issues.map((issue: string, j: number) => (
                        <li key={j}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {ref.proposed_refactoring?.pseudo_code && (
                  <div>
                    <div className="text-slate-400 text-sm mb-2">Codice Proposto:</div>
                    <pre className="bg-slate-900 rounded p-3 text-green-400 text-xs overflow-x-auto">
                      {ref.proposed_refactoring.pseudo_code}
                    </pre>
                  </div>
                )}

                {ref.benefits && (
                  <div className="mt-3">
                    <div className="text-slate-400 text-sm mb-1">Benefici:</div>
                    <ul className="list-disc list-inside text-green-400 text-sm space-y-1">
                      {ref.benefits.map((benefit: string, j: number) => (
                        <li key={j}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CoderSection({ data }: any) {
  const refactoredFiles = data.refactored_files || [];

  return (
    <div className="space-y-6">
      {refactoredFiles.length === 0 ? (
        <div className="text-slate-400 text-center py-8">
          Nessun file refactorizzato generato
        </div>
      ) : (
        refactoredFiles.map((file: any, i: number) => (
          <div key={i} className="bg-white/5 rounded-lg p-4">
            <div className="text-white font-medium mb-2">{file.original_file}</div>
            <div className="text-slate-400 text-sm mb-3">
              → {file.new_files?.length || 0} nuovi file generati
            </div>

            {file.new_files?.map((newFile: any, j: number) => (
              <div key={j} className="mb-4 bg-slate-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-green-400 font-mono text-sm">{newFile.path}</div>
                  <span className="text-slate-400 text-xs">{newFile.language}</span>
                </div>
                <div className="text-slate-400 text-sm mb-2">{newFile.description}</div>
                
                {newFile.changes && (
                  <div className="mb-3">
                    <div className="text-slate-400 text-xs mb-1">Modifiche:</div>
                    <ul className="list-disc list-inside text-slate-300 text-xs space-y-1">
                      {newFile.changes.map((change: string, k: number) => (
                        <li key={k}>{change}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {newFile.content && (
                  <details className="mt-2">
                    <summary className="text-blue-400 text-sm cursor-pointer hover:text-blue-300">
                      Mostra codice completo
                    </summary>
                    <pre className="mt-2 bg-slate-950 rounded p-3 text-green-400 text-xs overflow-x-auto max-h-96">
                      {newFile.content}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function OptimizerSection({ data }: any) {
  const performanceAnalysis = data.performance_analysis || [];
  const quickWins = data.quick_wins || [];
  const dataStructureOpts = data.data_structure_optimizations || [];

  return (
    <div className="space-y-6">
      {/* Quick Wins */}
      {quickWins.length > 0 && (
        <div>
          <h4 className="text-white font-semibold text-lg mb-3">⚡ Quick Wins</h4>
          <div className="space-y-3">
            {quickWins.map((win: any, i: number) => (
              <div key={i} className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="text-white font-medium mb-1">{win.optimization}</div>
                <div className="text-green-400 text-sm mb-2">📈 {win.impact}</div>
                <div className="text-slate-400 text-xs">Effort: {win.effort_hours}h</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Analysis */}
      {performanceAnalysis.length > 0 && (
        <div>
          <h4 className="text-white font-semibold text-lg mb-3">Analisi Performance Dettagliata</h4>
          <div className="space-y-4">
            {performanceAnalysis.map((analysis: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-white font-medium">{analysis.file}</div>
                    <div className="text-slate-400 text-sm">{analysis.function}</div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    analysis.priority === 'CRITICAL' ? 'bg-red-500' : 'bg-orange-500'
                  }`}>
                    {analysis.priority}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="bg-red-500/10 rounded p-3">
                    <div className="text-slate-400 text-xs mb-1">Complessità Attuale</div>
                    <div className="text-red-400 font-mono">{analysis.current_complexity?.time}</div>
                  </div>
                  <div className="bg-green-500/10 rounded p-3">
                    <div className="text-slate-400 text-xs mb-1">Complessità Ottimizzata</div>
                    <div className="text-green-400 font-mono">{analysis.optimization?.optimized_complexity?.time}</div>
                  </div>
                </div>

                {analysis.optimization?.optimized_code && (
                  <div>
                    <div className="text-slate-400 text-sm mb-2">Codice Ottimizzato:</div>
                    <pre className="bg-slate-900 rounded p-3 text-green-400 text-xs overflow-x-auto">
                      {analysis.optimization.optimized_code}
                    </pre>
                    <div className="text-yellow-400 text-sm mt-2">
                      ⚡ {analysis.optimization.improvement_factor}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Structure Optimizations */}
      {dataStructureOpts.length > 0 && (
        <div>
          <h4 className="text-white font-semibold text-lg mb-3">Ottimizzazioni Strutture Dati</h4>
          <div className="space-y-3">
            {dataStructureOpts.map((opt: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-4">
                <div className="text-white font-medium mb-2">{opt.file}</div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="text-slate-400 text-xs">Attuale</div>
                    <div className="text-red-400 text-sm">{opt.current}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs">Raccomandato</div>
                    <div className="text-green-400 text-sm">{opt.recommended}</div>
                  </div>
                </div>
                <div className="text-yellow-400 text-sm">📈 {opt.improvement}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ValidatorSection({ data }: any) {
  const securityFindings = data.security_findings || [];
  const generatedTests = data.generated_tests || [];

  return (
    <div className="space-y-6">
      {/* Security Findings */}
      {securityFindings.length > 0 && (
        <div>
          <h4 className="text-white font-semibold text-lg mb-3">🔒 Vulnerabilità di Sicurezza ({securityFindings.length})</h4>
          <div className="space-y-3">
            {securityFindings.map((finding: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-4 border-l-4 border-red-500">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-white font-medium mb-1">{finding.category}</div>
                    <div className="text-slate-400 text-sm">{finding.file}:{finding.line}</div>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      finding.severity === 'CRITICAL' ? 'bg-red-500' : 'bg-orange-500'
                    }`}>
                      {finding.severity}
                    </span>
                    <span className="px-2 py-1 rounded text-xs bg-slate-700">
                      CVSS {finding.cvss_score}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900 rounded p-2 mb-2">
                  <code className="text-red-400 text-xs">{finding.code}</code>
                </div>

                <div className="text-slate-300 text-sm mb-2">{finding.vulnerability}</div>
                <div className="text-slate-400 text-xs mb-2">
                  {finding.cwe} • {finding.owasp}
                </div>

                {finding.remediation_code && (
                  <details className="mt-2">
                    <summary className="text-green-400 text-sm cursor-pointer">
                      💡 Soluzione
                    </summary>
                    <pre className="mt-2 bg-slate-900 rounded p-3 text-green-400 text-xs overflow-x-auto">
                      {finding.remediation_code}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated Tests */}
      {generatedTests.length > 0 && (
        <div>
          <h4 className="text-white font-semibold text-lg mb-3">🧪 Test Generati ({generatedTests.length})</h4>
          <div className="space-y-4">
            {generatedTests.map((test: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white font-medium">{test.test_file}</div>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 rounded text-xs bg-blue-500">
                      {test.framework}
                    </span>
                    <span className="px-2 py-1 rounded text-xs bg-green-500">
                      {test.test_count} tests
                    </span>
                  </div>
                </div>

                {test.tests && (
                  <div className="mb-3">
                    <div className="text-slate-400 text-sm mb-2">Test Cases:</div>
                    <ul className="space-y-1">
                      {test.tests.map((t: any, j: number) => (
                        <li key={j} className="text-slate-300 text-sm flex items-start gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            t.type === 'happy_path' ? 'bg-green-500/20 text-green-400' :
                            t.type === 'error_case' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {t.type}
                          </span>
                          <span>{t.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {test.content && (
                  <details>
                    <summary className="text-blue-400 text-sm cursor-pointer">
                      Mostra codice test completo
                    </summary>
                    <pre className="mt-2 bg-slate-900 rounded p-3 text-green-400 text-xs overflow-x-auto max-h-96">
                      {test.content}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
