import { Link } from 'react-router-dom'
import {
  ArrowRight, BrainCircuit, Code2, Server, DollarSign,
  GitBranch, BarChart3, Shield, Eye, ShieldCheck, Zap,
} from 'lucide-react'
import { DEMO_SESSION_IDS } from '../services/mockData'

const agents = [
  { icon: Code2,       name: 'Code Analyzer',     desc: 'Detects languages, frameworks, cloud SDK coupling, and technical debt',                                                  mvp: true  },
  { icon: Server,      name: 'Infra Analyzer',     desc: 'Parses Terraform, Bicep, K8s, ARM — maps services to Azure equivalents',                                               mvp: true  },
  { icon: Zap,         name: 'MCP Enrichment',     desc: 'Phase 1.5 — calls Azure Skills (azure-migrate, advisor, pricing, WAF, cloudarchitect) and Azure DevOps for real data', mvp: true  },
  { icon: DollarSign,  name: 'Cost Optimizer',     desc: 'FinOps analysis: right-sizing, reserved instances, PaaS migration savings',                                            mvp: false },
  { icon: GitBranch,   name: 'Migration Planner',  desc: 'CAF 6Rs strategy, wave planning, risk register, tooling recommendations',                                              mvp: false },
  { icon: BarChart3,   name: 'GAP Analyzer',       desc: 'Current vs target state across 7 dimensions with remediation roadmap',                                                 mvp: false },
  { icon: Shield,      name: 'WAF Reviewer',       desc: 'Scores architecture against all 5 Well-Architected Framework pillars',                                                  mvp: false },
  { icon: ShieldCheck, name: 'Quality Analyzer',   desc: 'SonarQube-level static analysis on code and IaC: bugs, vulnerabilities, smells, debt',                                mvp: false },
]

const demoReports = [
  { id: DEMO_SESSION_IDS.contoso, name: 'Contoso E-Commerce', scenario: 'AWS → Azure', score: '3.2', savings: '$4,200/mo' },
  { id: DEMO_SESSION_IDS.techcorp, name: 'TechCorp Legacy CRM', scenario: 'On-Prem → Azure', score: '2.1', savings: '$8,100/mo' },
  { id: DEMO_SESSION_IDS.finserv, name: 'FinServ Trading API', scenario: 'Azure Optimization', score: '4.1', savings: '$12,800/mo' },
]

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center py-8">
        <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-600/30 text-blue-400 text-sm px-4 py-1.5 rounded-full mb-6">
          <BrainCircuit className="w-4 h-4" />
          Powered by Azure AI Foundry · Follows CAF & WAF
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">
          Efesto<br />AI Fabryc
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto text-lg leading-relaxed">
          Multi-agent AI system for cloud architecture analysis, migration planning,
          cost optimization, and Well-Architected Framework review.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <Link
            to="/analysis"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Start New Analysis <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/architecture"
            className="inline-flex items-center gap-2 border border-gray-700 hover:border-gray-600 text-gray-300 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            View Architecture
          </Link>
        </div>
      </div>

      {/* Demo Reports Quick Access */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Sample Analysis Reports</h2>
        <div className="grid grid-cols-3 gap-4">
          {demoReports.map(({ id, name, scenario, score, savings }) => (
            <Link
              key={id}
              to={`/report/${id}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-blue-600/50 transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{scenario}</span>
                <Eye className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
              </div>
              <div className="font-medium text-white text-sm mb-3">{name}</div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Score </span>
                  <span className="text-white font-semibold">{score}/5</span>
                </div>
                <div>
                  <span className="text-gray-500">Savings </span>
                  <span className="text-green-400 font-semibold">{savings}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Agents */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Specialist Agents</h2>
        <div className="grid grid-cols-3 gap-4">
          {agents.map(({ icon: Icon, name, desc, mvp }) => (
            <div
              key={name}
              className={mvp
                ? 'relative bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors'
                : 'relative bg-gray-900/40 border border-gray-800/40 rounded-xl p-5 opacity-40 cursor-not-allowed select-none'
              }
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${mvp ? 'bg-blue-600/15' : 'bg-gray-700/30'}`}>
                <Icon className={`w-5 h-5 ${mvp ? 'text-blue-400' : 'text-gray-600'}`} />
              </div>
              <div className={`font-medium text-sm mb-1 ${mvp ? 'text-white' : 'text-gray-600'}`}>{name}</div>
              <div className="text-xs text-gray-600 leading-relaxed">{desc}</div>
              {!mvp && (
                <span className="absolute top-3 right-3 text-[9px] font-semibold text-gray-600 uppercase tracking-wider">
                  Coming soon
                </span>
              )}
              {mvp && (
                <span className="absolute top-3 right-3 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  <span className="text-[9px] font-semibold text-green-500 uppercase tracking-wider">Active</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Use Cases */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Supported Use Cases</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { title: 'AWS → Azure Migration', desc: 'Complete service mapping, wave plan, and cost comparison' },
            { title: 'GCP → Azure Migration', desc: 'GKE to AKS, Pub/Sub to Event Hubs, Cloud SQL to Azure DB' },
            { title: 'On-Premises Modernization', desc: 'Lift-and-shift vs re-architect decision support' },
            { title: 'Cost Optimization', desc: 'Identify savings without migration — right-size existing Azure' },
            { title: 'WAF Assessment', desc: 'Score your architecture and get a prioritized remediation plan' },
            { title: 'App Modernization', desc: 'Monolith to microservices or serverless refactoring guide' },
            { title: 'Code & IaC Quality Gate', desc: 'SonarQube-level static analysis on all code and infrastructure artifacts — bugs, vulnerabilities, smells, and security hotspots' },
          ].map(({ title, desc }) => (
            <div key={title} className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-white">{title}</div>
                <div className="text-xs text-gray-500 mt-1">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
