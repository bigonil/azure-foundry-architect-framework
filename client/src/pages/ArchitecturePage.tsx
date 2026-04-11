import ArchitectureDiagram from '../components/ArchitectureDiagram/ArchitectureDiagram'

export default function ArchitecturePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Architecture Overview</h1>
        <p className="text-gray-400 mt-1">
          Multi-agent system powered by Azure AI Foundry — click on components to explore.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-800 overflow-hidden">
        <ArchitectureDiagram />
      </div>

      {/* Architecture Highlights */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Execution Modes</div>
          <div className="text-sm text-white font-medium mb-2">Dual-Mode Agent Framework</div>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1 flex-shrink-0" />
              <span><strong className="text-gray-300">Foundry Mode</strong> — Azure AI Agent Service with persistence, threading, and file search</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1 flex-shrink-0" />
              <span><strong className="text-gray-300">Direct Mode</strong> — Azure OpenAI chat completions for lower latency</span>
            </li>
          </ul>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Orchestration</div>
          <div className="text-sm text-white font-medium mb-2">Phased Parallel Execution</div>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1 flex-shrink-0" />
              <span><strong className="text-gray-300">Phase 1</strong> — Code + Infra Analyzers (sequential, produce context)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1 flex-shrink-0" />
              <span><strong className="text-gray-300">Phase 2</strong> — Cost, Migration, GAP, WAF (parallel, up to 4 concurrent)</span>
            </li>
          </ul>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Security</div>
          <div className="text-sm text-white font-medium mb-2">Zero-Secret Architecture</div>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1 flex-shrink-0" />
              <span><strong className="text-gray-300">Managed Identity</strong> — RBAC-based auth to all Azure services</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-1 flex-shrink-0" />
              <span><strong className="text-gray-300">Private Endpoints</strong> — No public internet exposure for PaaS</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
