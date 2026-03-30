import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  Search,
  History,
  BrainCircuit,
  Map,
  ShieldCheck,
} from 'lucide-react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/analysis', label: 'New Analysis', icon: Search },
  { path: '/architecture', label: 'Architecture', icon: Map },
  { path: '/quality', label: 'Code Quality', icon: ShieldCheck },
  { path: '/history', label: 'History', icon: History },
]

const agentBadges = [
  { name: 'Code',      colors: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { name: 'Infra',     colors: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { name: 'Cost',      colors: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { name: 'Migration', colors: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { name: 'GAP',       colors: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { name: 'WAF',       colors: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm text-white">Architect</div>
              <div className="text-xs text-gray-400">AI Framework</div>
            </div>
          </div>
          {/* Demo badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Demo Mode</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                location.pathname === path
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Agents badge */}
        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
            Active Agents
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agentBadges.map(({ name, colors }) => (
              <span
                key={name}
                className={clsx('px-2 py-0.5 text-xs font-medium rounded-md border', colors)}
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Version */}
        <div className="px-4 pb-4 text-[10px] text-gray-600">
          v1.0.0 · Azure AI Foundry
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">{children}</div>
      </main>
    </div>
  )
}
