/**
 * ArchitectureDiagram.tsx
 * Full SVG architecture diagram for Azure Foundry Architect Framework.
 * Self-contained — no external icon dependencies.
 */
import React, { useState } from 'react'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  azureBlue:    '#0078D4',
  azureLight:   '#50E6FF',
  azureDark:    '#003067',
  azureBg:      '#EBF5FF',
  docker:       '#2496ED',
  dockerBg:     '#E3F6FF',
  green:        '#2E7D32',
  orange:       '#E65100',
  purple:       '#6A1B9A',
  red:          '#B71C1C',
  deepOrange:   '#BF360C',
  blueGrey:     '#37474F',
  teal:         '#00796B',
  amber:        '#F57F17',
  amberBg:      '#FFF8E1',
  monitorPurple:'#6A1B9A',
  monitorBg:    '#F3E5F5',
  securityRed:  '#C62828',
  securityBg:   '#FFEBEE',
  white:        '#FFFFFF',
  text:         '#1A1A2E',
  textLight:    '#555555',
  gridLine:     '#E0E0E0',
} as const

// ── Reusable SVG primitives ────────────────────────────────────────────────────

interface BoxProps {
  x: number; y: number; w: number; h: number
  fill: string; stroke: string; rx?: number
  label?: string; labelColor?: string; fontSize?: number; fontWeight?: string
  sublabel?: string; sublabelColor?: string
  onClick?: () => void
}

const Box: React.FC<BoxProps> = ({
  x, y, w, h, fill, stroke, rx = 8,
  label, labelColor = C.white, fontSize = 11, fontWeight = '600',
  sublabel, sublabelColor = 'rgba(255,255,255,0.75)',
  onClick,
}) => (
  <g onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
    <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={1.5} />
    {label && (
      <text x={x + w / 2} y={y + h / 2 - (sublabel ? 7 : 0)}
        textAnchor="middle" dominantBaseline="middle"
        fill={labelColor} fontSize={fontSize} fontWeight={fontWeight} fontFamily="system-ui,sans-serif">
        {label}
      </text>
    )}
    {sublabel && (
      <text x={x + w / 2} y={y + h / 2 + 9}
        textAnchor="middle" dominantBaseline="middle"
        fill={sublabelColor} fontSize={fontSize - 1} fontFamily="system-ui,sans-serif">
        {sublabel}
      </text>
    )}
  </g>
)

interface GroupProps {
  x: number; y: number; w: number; h: number
  fill: string; stroke: string; title: string
  titleColor?: string; rx?: number; dashed?: boolean
  children?: React.ReactNode
}

const Group: React.FC<GroupProps> = ({
  x, y, w, h, fill, stroke, title, titleColor = C.azureBlue,
  rx = 10, dashed = false, children,
}) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={rx}
      fill={fill} stroke={stroke} strokeWidth={2}
      strokeDasharray={dashed ? '6 3' : undefined}
      opacity={0.95}
    />
    <text x={x + 14} y={y + 17}
      fill={titleColor} fontSize={11} fontWeight="700" fontFamily="system-ui,sans-serif">
      {title}
    </text>
    {children}
  </g>
)

interface IconBoxProps {
  x: number; y: number; size?: number
  color: string; bg: string; label: string
  icon: React.ReactNode
  sublabel?: string
}

const IconBox: React.FC<IconBoxProps> = ({ x, y, size = 52, color, bg, label, icon, sublabel }) => (
  <g>
    <rect x={x} y={y} width={size} height={size} rx={10}
      fill={bg} stroke={color} strokeWidth={1.5} />
    <foreignObject x={x + size / 2 - 14} y={y + 6} width={28} height={28}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
        {icon}
      </div>
    </foreignObject>
    <text x={x + size / 2} y={y + size + 13}
      textAnchor="middle" fill={C.text} fontSize={9} fontWeight="600" fontFamily="system-ui,sans-serif">
      {label}
    </text>
    {sublabel && (
      <text x={x + size / 2} y={y + size + 24}
        textAnchor="middle" fill={C.textLight} fontSize={8} fontFamily="system-ui,sans-serif">
        {sublabel}
      </text>
    )}
  </g>
)

// Arrow component with optional label
interface ArrowProps {
  points: [number, number][]
  color?: string; width?: number; dashed?: boolean
  label?: string; labelX?: number; labelY?: number
  markerId?: string
}

const Arrow: React.FC<ArrowProps> = ({
  points, color = C.azureBlue, width = 1.5, dashed = false,
  label, labelX, labelY, markerId = 'arrow-default',
}) => {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={width}
        strokeDasharray={dashed ? '5 3' : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {label && labelX !== undefined && labelY !== undefined && (
        <text x={labelX} y={labelY} textAnchor="middle"
          fill={color} fontSize={8} fontStyle="italic" fontFamily="system-ui,sans-serif"
          style={{ pointerEvents: 'none' }}>
          {label}
        </text>
      )}
    </g>
  )
}

// ── Azure service icons (inline SVG) ──────────────────────────────────────────

const AzureLogoIcon = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 18 18" width={size} height={size}>
    <path d="M7.223 0H12.8l-5.254 15.73L0 12.813 7.223 0z" fill="#0078D4" />
    <path d="M10.656 4.519H18L10.453 18 4.56 16.165l6.096-11.646z" fill="#0078D4" />
  </svg>
)

const DockerIcon = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .103.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.185m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.185m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.185m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185" fill="#2496ED"/>
    <path d="M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288-.318-.243z" fill="#2496ED"/>
  </svg>
)

const BrainIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <path d="M9.5 2a2.5 2.5 0 0 1 2.45 2H12a5 5 0 0 1 5 5v1a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V9a5 5 0 0 1 5-5h.05A2.5 2.5 0 0 1 9.5 2z"/>
    <path d="M9 13v6M15 13v6M9 19h6M12 4v1"/>
  </svg>
)

const DatabaseIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
    <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>
  </svg>
)

const ShieldIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
)

const SearchIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.35-4.35"/>
  </svg>
)

const KeyIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="m21 2-9.6 9.6M15.5 7.5l3 3"/>
  </svg>
)

const ChartIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <path d="M3 3v18h18"/>
    <path d="m19 9-5 5-4-4-3 3"/>
  </svg>
)

const CpuIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <rect x="9" y="9" width="6" height="6"/>
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>
  </svg>
)

const GitBranchIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <line x1="6" y1="3" x2="6" y2="15"/>
    <circle cx="18" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <path d="M18 9a9 9 0 0 1-9 9"/>
  </svg>
)

const BarChartIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <rect x="2" y="16" width="4" height="6"/>
    <rect x="10" y="10" width="4" height="12"/>
    <rect x="18" y="4" width="4" height="18"/>
  </svg>
)

const CloudIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
)

const ServerIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <rect x="2" y="2" width="20" height="8" rx="2"/>
    <rect x="2" y="14" width="20" height="8" rx="2"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/>
    <line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>
)

const DollarIcon = ({ size = 20, color = C.white }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8}>
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
)

// ── Main component ─────────────────────────────────────────────────────────────

const ArchitectureDiagram: React.FC = () => {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

  const W = 1760
  const H = 1080

  return (
    <div style={{ width: '100%', overflowX: 'auto', background: '#0F172A', borderRadius: 12, padding: 8 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', minWidth: 900, display: 'block' }}
      >
        {/* ── Defs ── */}
        <defs>
          <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={C.azureBlue} />
          </marker>
          <marker id="arrow-white" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.6)" />
          </marker>
          <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={C.green} />
          </marker>
          <marker id="arrow-orange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={C.orange} />
          </marker>
          <marker id="arrow-purple" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={C.purple} />
          </marker>
          <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={C.red} />
          </marker>
          <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={C.amber} />
          </marker>
          <linearGradient id="grad-azure" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0078D4" />
            <stop offset="100%" stopColor="#003067" />
          </linearGradient>
          <linearGradient id="grad-header" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0078D4" />
            <stop offset="50%" stopColor="#003067" />
            <stop offset="100%" stopColor="#0078D4" />
          </linearGradient>
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* ── Background ── */}
        <rect width={W} height={H} fill="#0F172A" rx={12} />

        {/* ── Header ── */}
        <rect x={0} y={0} width={W} height={52} rx={12} fill="url(#grad-header)" />
        <rect x={0} y={40} width={W} height={12} fill="url(#grad-header)" />
        <text x={W / 2} y={30} textAnchor="middle" fill={C.white}
          fontSize={18} fontWeight="700" fontFamily="system-ui,sans-serif">
          Azure Foundry Architect Framework — Multi-Agent Architecture
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION A — User
        ════════════════════════════════════════════════════════════════════════ */}
        <g>
          <rect x={20} y={68} width={110} height={80} rx={10}
            fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} />
          {/* Person icon */}
          <circle cx={75} cy={92} r={12} fill={C.azureLight} />
          <path d="M55 148 C55 128 95 128 95 148" fill={C.azureLight} />
          <text x={75} y={158} textAnchor="middle" fill={C.white} fontSize={9}
            fontWeight="600" fontFamily="system-ui,sans-serif">User / Browser</text>
        </g>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION B — Local Dev (Docker Compose)
        ════════════════════════════════════════════════════════════════════════ */}
        <Group x={20} y={165} w={130} h={390} fill="rgba(36,150,237,0.07)"
          stroke={C.docker} title="Docker Compose" titleColor={C.docker}>
          <g transform="translate(20, 25)">
            <DockerIcon size={22} />
          </g>
        </Group>

        {/* Nginx */}
        <Box x={30} y={218} w={110} h={44} fill="#009639" stroke="#006B2B"
          label="nginx:1.27" sublabel="Reverse Proxy" />

        {/* React */}
        <Box x={30} y={272} w={110} h={44} fill="#1565C0" stroke="#003167"
          label="React 18 + Vite" sublabel="SPA + Tailwind" />

        {/* FastAPI local -->*/}
        <Box x={30} y={326} w={110} h={44} fill={C.teal} stroke="#004D40"
          label="FastAPI + Uvicorn" sublabel=":8000 hot-reload" />

        {/* Redis */}
        <Box x={30} y={380} w={110} h={44} fill="#DC382D" stroke="#A82A21"
          label="Redis 7-alpine" sublabel="Session Cache" />

        {/* Docker compose label */}
        <text x={85} y={442} textAnchor="middle" fill={C.docker} fontSize={8}
          fontStyle="italic" fontFamily="system-ui,sans-serif">docker compose up</text>
        <text x={85} y={454} textAnchor="middle" fill={C.docker} fontSize={8}
          fontStyle="italic" fontFamily="system-ui,sans-serif">API :8000 | UI :3000</text>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION C — Azure outer boundary
        ════════════════════════════════════════════════════════════════════════ */}
        <rect x={165} y={65} width={1575} height={1000} rx={14}
          fill="rgba(0,120,212,0.04)" stroke={C.azureBlue} strokeWidth={2.5} strokeDasharray="none" />
        {/* Azure badge */}
        <g transform="translate(1690, 72)">
          <AzureLogoIcon size={32} />
        </g>
        <text x={1730} y={92} fill={C.azureBlue} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">
          Azure
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION C1 — Azure Container Apps Environment
        ════════════════════════════════════════════════════════════════════════ */}
        <rect x={180} y={80} width={750} height={975} rx={10}
          fill="rgba(0,150,100,0.05)" stroke="#00897B" strokeWidth={1.8} strokeDasharray="6 3" />
        <text x={196} y={97} fill="#00897B" fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">
          Azure Container Apps Environment — cae-afaf-dev (10.0.0.0/23)
        </text>

        {/* ── API Container App ─────────────────────────────────────────────── */}
        <rect x={195} y={105} width={720} height={62} rx={8}
          fill={C.teal} stroke="#004D40" strokeWidth={1.5} filter="url(#shadow)" />
        <g transform="translate(205, 118)">
          <ServerIcon size={22} />
        </g>
        <text x={290} y={126} fill={C.white} fontSize={12} fontWeight="700" fontFamily="system-ui,sans-serif">
          API Container App (FastAPI 0.115 + Uvicorn)
        </text>
        <text x={290} y={143} fill="rgba(255,255,255,0.7)" fontSize={9} fontFamily="system-ui,sans-serif">
          ca-api-afaf-dev  |  CPU: 0.5  |  RAM: 1 Gi  |  Scale: 0→10 replicas  |  TLS termination  |  /health probe
        </text>

        {/* ── Orchestrator Agent ────────────────────────────────────────────── */}
        <rect x={195} y={182} width={720} height={58} rx={8}
          fill="url(#grad-azure)" stroke={C.azureDark} strokeWidth={1.5} filter="url(#shadow)" />
        <g transform="translate(205, 195)">
          <BrainIcon size={24} />
        </g>
        <text x={240} y={204} fill={C.white} fontSize={12} fontWeight="700" fontFamily="system-ui,sans-serif">
          Orchestrator Agent
        </text>
        <text x={240} y={220} fill="rgba(255,255,255,0.7)" fontSize={9} fontFamily="system-ui,sans-serif">
          Phase planning · Context propagation · asyncio Semaphore (max 4) · Report synthesis
        </text>

        {/* Phase 1 label */}
        <text x={200} y={258} fill="#66BB6A" fontSize={9} fontStyle="italic" fontFamily="system-ui,sans-serif">
          ↓ Phase 1 — Sequential (produce shared context)
        </text>

        {/* ── Code Analyzer ────────────────────────────────────────────────── */}
        <rect x={195} y={264} width={225} height={108} rx={8}
          fill={C.green} stroke="#1B5E20" strokeWidth={1.5}
          opacity={hoveredAgent === 'code' ? 1 : 0.92}
          onMouseEnter={() => setHoveredAgent('code')}
          onMouseLeave={() => setHoveredAgent(null)}
          style={{ cursor: 'pointer' }}
        />
        <g transform="translate(200, 272)"><CpuIcon size={20} /></g>
        <text x={307} y={284} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Code Analyzer</text>
        <text x={307} y={299} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Languages · Frameworks</text>
        <text x={307} y={312} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Cloud SDK coupling</text>
        <text x={307} y={325} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Tech debt score · 12-Factor</text>
        <text x={307} y={338} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Hardcoded secrets scan</text>
        <text x={307} y={360} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">Tool: CodeInterpreter</text>

        {/* ── Infra Analyzer ───────────────────────────────────────────────── */}
        <rect x={435} y={264} width={225} height={108} rx={8}
          fill={C.orange} stroke="#BF360C" strokeWidth={1.5}
          opacity={hoveredAgent === 'infra' ? 1 : 0.92}
          onMouseEnter={() => setHoveredAgent('infra')}
          onMouseLeave={() => setHoveredAgent(null)}
          style={{ cursor: 'pointer' }}
        />
        <g transform="translate(440, 272)"><ServerIcon size={20} /></g>
        <text x={547} y={284} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Infra Analyzer</text>
        <text x={547} y={299} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Terraform · Bicep · ARM</text>
        <text x={547} y={312} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">K8s · Docker Compose</text>
        <text x={547} y={325} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Resource inventory</text>
        <text x={547} y={338} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Service mapping → Azure</text>
        <text x={547} y={360} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">Tool: CodeInterpreter</text>

        {/* Phase 2 label */}
        <text x={200} y={388} fill="#FFB74D" fontSize={9} fontStyle="italic" fontFamily="system-ui,sans-serif">
          ↓ Phase 2 — Parallel (asyncio.gather)
        </text>

        {/* ── Cost Optimizer ───────────────────────────────────────────────── */}
        <rect x={195} y={396} width={225} height={108} rx={8}
          fill={C.purple} stroke="#4A148C" strokeWidth={1.5}
          opacity={hoveredAgent === 'cost' ? 1 : 0.92}
          onMouseEnter={() => setHoveredAgent('cost')}
          onMouseLeave={() => setHoveredAgent(null)}
          style={{ cursor: 'pointer' }}
        />
        <g transform="translate(200, 404)"><DollarIcon size={20} /></g>
        <text x={307} y={416} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Cost Optimizer</text>
        <text x={307} y={431} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">FinOps analysis</text>
        <text x={307} y={444} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Right-sizing recs</text>
        <text x={307} y={457} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Reserved Instance ROI</text>
        <text x={307} y={470} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Azure Pricing API</text>
        <text x={307} y={492} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">Tool: FunctionTool (pricing)</text>

        {/* ── Migration Planner ────────────────────────────────────────────── */}
        <rect x={435} y={396} width={225} height={108} rx={8}
          fill={C.red} stroke="#7F0000" strokeWidth={1.5}
          opacity={hoveredAgent === 'migration' ? 1 : 0.92}
          onMouseEnter={() => setHoveredAgent('migration')}
          onMouseLeave={() => setHoveredAgent(null)}
          style={{ cursor: 'pointer' }}
        />
        <g transform="translate(440, 404)"><GitBranchIcon size={20} /></g>
        <text x={547} y={416} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Migration Planner</text>
        <text x={547} y={431} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">CAF 6Rs Strategy</text>
        <text x={547} y={444} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Wave planning</text>
        <text x={547} y={457} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Risk register</text>
        <text x={547} y={470} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Landing Zone design</text>
        <text x={547} y={492} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">Tool: FileSearch (RAG)</text>

        {/* ── GAP Analyzer ─────────────────────────────────────────────────── */}
        <rect x={195} y={528} width={225} height={108} rx={8}
          fill={C.deepOrange} stroke="#870000" strokeWidth={1.5}
          opacity={hoveredAgent === 'gap' ? 1 : 0.92}
          onMouseEnter={() => setHoveredAgent('gap')}
          onMouseLeave={() => setHoveredAgent(null)}
          style={{ cursor: 'pointer' }}
        />
        <g transform="translate(200, 536)"><BarChartIcon size={20} /></g>
        <text x={307} y={548} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">GAP Analyzer</text>
        <text x={307} y={563} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">7 dimensions</text>
        <text x={307} y={576} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Maturity score 1-5</text>
        <text x={307} y={589} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Remediation roadmap</text>
        <text x={307} y={602} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Phased priorities</text>
        <text x={307} y={624} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">Tool: direct OpenAI</text>

        {/* ── WAF Reviewer ─────────────────────────────────────────────────── */}
        <rect x={435} y={528} width={225} height={108} rx={8}
          fill={C.blueGrey} stroke="#102027" strokeWidth={1.5}
          opacity={hoveredAgent === 'waf' ? 1 : 0.92}
          onMouseEnter={() => setHoveredAgent('waf')}
          onMouseLeave={() => setHoveredAgent(null)}
          style={{ cursor: 'pointer' }}
        />
        <g transform="translate(440, 536)"><ShieldIcon size={20} /></g>
        <text x={547} y={548} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">WAF Reviewer</text>
        <text x={547} y={563} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">5 WAF Pillars (score 1-5)</text>
        <text x={547} y={576} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Reliability · Security</text>
        <text x={547} y={589} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Cost · OpEx · Perf</text>
        <text x={547} y={602} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={8.5} fontFamily="system-ui,sans-serif">Quick wins list</text>
        <text x={547} y={624} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">Tool: FileSearch (RAG)</text>

        {/* ── Final Report Synthesis ────────────────────────────────────────── */}
        <rect x={195} y={656} width={720} height={58} rx={8}
          fill="#0D47A1" stroke="#002171" strokeWidth={1.5} filter="url(#shadow)" />
        <text x={555} y={679} textAnchor="middle" fill={C.white} fontSize={12} fontWeight="700" fontFamily="system-ui,sans-serif">
          📋 Final Report Synthesis
        </text>
        <text x={555} y={697} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={9} fontFamily="system-ui,sans-serif">
          Executive Summary · Maturity Score · Top 10 Actions · Migration Roadmap · Cost Savings
        </text>

        {/* ── Managed Identity note ────────────────────────────────────────── */}
        <rect x={195} y={728} width={720} height={36} rx={6}
          fill="rgba(198,40,40,0.15)" stroke={C.securityRed} strokeWidth={1} />
        <text x={555} y={742} textAnchor="middle" fill="#EF9A9A" fontSize={9} fontFamily="system-ui,sans-serif">
          🔑 Managed Identity (System Assigned) — No API Keys in environment variables
        </text>
        <text x={555} y={757} textAnchor="middle" fill="#EF9A9A" fontSize={8.5} fontFamily="system-ui,sans-serif">
          RBAC: Cognitive Services OpenAI User | Search Index Data Reader | Key Vault Secrets User
        </text>

        {/* VNet */}
        <rect x={195} y={778} width={720} height={30} rx={6}
          fill="rgba(0,120,212,0.1)" stroke={C.azureBlue} strokeWidth={1} strokeDasharray="4 2" />
        <text x={555} y={798} textAnchor="middle" fill={C.azureLight} fontSize={8.5} fontFamily="system-ui,sans-serif">
          🌐 Azure Virtual Network  10.0.0.0/16  |  snet-container-apps: 10.0.0.0/23  |  snet-private-endpoints: 10.0.2.0/24
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION C2 — Azure AI Foundry Platform
        ════════════════════════════════════════════════════════════════════════ */}
        <rect x={958} y={80} width={770} height={420} rx={10}
          fill="rgba(0,120,212,0.07)" stroke={C.azureBlue} strokeWidth={1.8} />
        <text x={974} y={97} fill={C.azureLight} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">
          Azure AI Foundry Platform
        </text>

        {/* AI Foundry Hub */}
        <rect x={968} y={108} width={155} height={155} rx={8}
          fill="rgba(0,120,212,0.15)" stroke={C.azureBlue} strokeWidth={1} />
        <g transform="translate(1018, 122)">
          <BrainIcon size={28} color={C.azureLight} />
        </g>
        <text x={1045} y={166} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">AI Foundry Hub</text>
        <text x={1045} y={179} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">hub-afaf-dev</text>
        <text x={1045} y={193} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">SystemAssigned MI</text>
        <text x={1045} y={206} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">Storage + KeyVault</text>
        <text x={1045} y={219} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">Agent Service</text>
        <text x={1045} y={253} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={7.5} fontFamily="system-ui,sans-serif">AI Project: project-afaf-dev</text>

        {/* Azure OpenAI */}
        <rect x={1138} y={108} width={290} height={200} rx={8}
          fill="rgba(0,120,212,0.15)" stroke={C.azureBlue} strokeWidth={1} />
        <g transform="translate(1240, 122)">
          <CloudIcon size={28} color={C.azureLight} />
        </g>
        <text x={1283} y={163} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Azure OpenAI</text>
        <text x={1283} y={176} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">oai-afaf-dev · S0</text>
        {/* GPT-4o row */}
        <rect x={1148} y={190} width={270} height={28} rx={5} fill={C.azureBlue} stroke="none" />
        <text x={1283} y={208} textAnchor="middle" fill={C.white} fontSize={9} fontWeight="700" fontFamily="system-ui,sans-serif">
          gpt-4o (2024-11-20) · GlobalStandard 100K TPM
        </text>
        {/* GPT-4o-mini row */}
        <rect x={1148} y={224} width={270} height={28} rx={5} fill="rgba(80,230,255,0.25)" stroke={C.azureLight} strokeWidth={1} />
        <text x={1283} y={242} textAnchor="middle" fill={C.azureLight} fontSize={9} fontWeight="700" fontFamily="system-ui,sans-serif">
          gpt-4o-mini · GlobalStandard 200K TPM
        </text>
        <text x={1283} y={264} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">
          disableLocalAuth: prod | RAI: Microsoft.DefaultV2
        </text>
        <text x={1283} y={298} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">
          Private endpoint (prod only)
        </text>

        {/* Azure AI Search */}
        <rect x={1440} y={108} width={278} height={200} rx={8}
          fill="rgba(0,120,212,0.15)" stroke={C.azureBlue} strokeWidth={1} />
        <g transform="translate(1556, 122)">
          <SearchIcon size={28} color={C.azureLight} />
        </g>
        <text x={1579} y={163} textAnchor="middle" fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Azure AI Search</text>
        <text x={1579} y={176} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">srch-afaf-dev · Semantic Standard</text>
        {/* Indexes */}
        <rect x={1450} y={190} width={258} height={22} rx={4} fill="rgba(80,230,255,0.15)" stroke={C.azureLight} strokeWidth={1} />
        <text x={1579} y={205} textAnchor="middle" fill={C.azureLight} fontSize={8.5} fontFamily="system-ui,sans-serif">📑 Index: caf-guidelines</text>
        <rect x={1450} y={216} width={258} height={22} rx={4} fill="rgba(80,230,255,0.15)" stroke={C.azureLight} strokeWidth={1} />
        <text x={1579} y={231} textAnchor="middle" fill={C.azureLight} fontSize={8.5} fontFamily="system-ui,sans-serif">📑 Index: waf-pillars</text>
        <rect x={1450} y={242} width={258} height={22} rx={4} fill="rgba(80,230,255,0.15)" stroke={C.azureLight} strokeWidth={1} />
        <text x={1579} y={257} textAnchor="middle" fill={C.azureLight} fontSize={8.5} fontFamily="system-ui,sans-serif">📑 Index: migration-patterns</text>
        <text x={1579} y={296} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7.5} fontFamily="system-ui,sans-serif">
          RAG for Migration + WAF agents
        </text>

        {/* Agent tools row */}
        <rect x={968} y={320} width={750} height={38} rx={6}
          fill="rgba(0,50,100,0.4)" stroke="rgba(80,230,255,0.3)" strokeWidth={1} />
        <text x={1343} y={333} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={9} fontFamily="system-ui,sans-serif">
          Agent Tools:
        </text>
        <text x={1343} y={347} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={8.5} fontFamily="system-ui,sans-serif">
          FileSearchTool (RAG) · CodeInterpreterTool (analysis) · FunctionTool (pricing API) · Foundry Mode ↔ Direct Mode
        </text>

        {/* AAD Auth strip */}
        <rect x={968} y={370} width={750} height={28} rx={5}
          fill="rgba(198,40,40,0.15)" stroke="rgba(198,40,40,0.4)" strokeWidth={1} />
        <text x={1343} y={389} textAnchor="middle" fill="#EF9A9A" fontSize={8.5} fontFamily="system-ui,sans-serif">
          🔐 AAD Auth (Managed Identity) — Local auth disabled (prod) — Zero secrets stored
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION C3 — Data Layer
        ════════════════════════════════════════════════════════════════════════ */}
        <rect x={958} y={520} width={380} height={270} rx={10}
          fill="rgba(245,127,23,0.07)" stroke={C.amber} strokeWidth={1.8} />
        <text x={974} y={537} fill={C.amber} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">
          Data Layer
        </text>

        {/* MongoDB */}
        <g transform="translate(970, 548)">
          <DatabaseIcon size={32} color="#4DB33D" />
        </g>
        <text x={1010} y={560} fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">MongoDB 7</text>
        <text x={1010} y={573} fill="rgba(255,255,255,0.6)" fontSize={8.5} fontFamily="system-ui,sans-serif">ca-mongo-afaf-dev · Container App</text>
        <rect x={968} y={580} width={355} height={22} rx={4} fill="rgba(77,179,61,0.2)" stroke="#4DB33D" strokeWidth={1} />
        <text x={1145} y={595} textAnchor="middle" fill="#4DB33D" fontSize={8} fontFamily="system-ui,sans-serif">Azure Files persistence · 1 replica (stateful)</text>
        <rect x={968} y={606} width={355} height={22} rx={4} fill="rgba(77,179,61,0.15)" stroke="#4DB33D" strokeWidth={0.5} />
        <text x={1145} y={621} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={8} fontFamily="system-ui,sans-serif">Collection: sessions · index: session_id · TTL 7d</text>
        <rect x={968} y={632} width={355} height={22} rx={4} fill="rgba(77,179,61,0.15)" stroke="#4DB33D" strokeWidth={0.5} />
        <text x={1145} y={647} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={8} fontFamily="system-ui,sans-serif">Collection: reports · index: project_name · TTL 30d</text>

        {/* Storage Account */}
        <text x={974} y={680} fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Storage Account</text>
        <text x={974} y={693} fill="rgba(255,255,255,0.6)" fontSize={8.5} fontFamily="system-ui,sans-serif">AI Hub backing store</text>
        <text x={974} y={706} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Standard_ZRS (prod) · Standard_LRS (dev)</text>
        <text x={974} y={719} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">TLS 1.2+ · No public blob access</text>
        <text x={974} y={732} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Encryption at rest (Microsoft managed)</text>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION C4 — Security & Governance
        ════════════════════════════════════════════════════════════════════════ */}
        <rect x={1358} y={520} width={360} height={270} rx={10}
          fill="rgba(198,40,40,0.07)" stroke={C.securityRed} strokeWidth={1.8} />
        <text x={1374} y={537} fill="#EF9A9A" fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">
          Security &amp; Governance
        </text>

        {/* Key Vault */}
        <g transform="translate(1368, 548)">
          <KeyIcon size={32} color="#EF9A9A" />
        </g>
        <text x={1410} y={560} fill={C.white} fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">Azure Key Vault</text>
        <text x={1410} y={573} fill="rgba(255,255,255,0.6)" fontSize={8.5} fontFamily="system-ui,sans-serif">kv-afaf-dev</text>
        <text x={1410} y={586} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">RBAC auth (no access policies)</text>
        <text x={1410} y={599} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Soft delete 90d + Purge protection (prod)</text>
        <text x={1410} y={612} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Private endpoint (prod)</text>

        {/* RBAC table */}
        <rect x={1365} y={628} width={343} height={22} rx={4} fill="rgba(198,40,40,0.2)" stroke="rgba(198,40,40,0.5)" strokeWidth={1} />
        <text x={1536} y={643} textAnchor="middle" fill="#EF9A9A" fontSize={8} fontFamily="system-ui,sans-serif">Cognitive Services OpenAI User → oai-afaf-dev</text>
        <rect x={1365} y={654} width={343} height={22} rx={4} fill="rgba(198,40,40,0.15)" />
        <text x={1536} y={669} textAnchor="middle" fill="#EF9A9A" fontSize={8} fontFamily="system-ui,sans-serif">Search Index Data Reader → srch-afaf-dev</text>
        <rect x={1365} y={680} width={343} height={22} rx={4} fill="rgba(198,40,40,0.15)" />
        <text x={1536} y={695} textAnchor="middle" fill="#EF9A9A" fontSize={8} fontFamily="system-ui,sans-serif">Key Vault Secrets User → kv-afaf-dev</text>

        <text x={1374} y={724} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Container Registry (ACR): Managed Identity pull</text>
        <text x={1374} y={736} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Zero secrets in env vars — KV Reference pattern</text>
        <text x={1374} y={748} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Microsoft Entra ID + Azure RBAC throughout</text>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION C5 — Observability
        ════════════════════════════════════════════════════════════════════════ */}
        <rect x={958} y={808} width={760} height={230} rx={10}
          fill="rgba(106,27,154,0.07)" stroke={C.monitorPurple} strokeWidth={1.8} />
        <text x={974} y={825} fill="#CE93D8" fontSize={10} fontWeight="700" fontFamily="system-ui,sans-serif">
          Observability — WAF Pillar: Operational Excellence
        </text>

        {/* Log Analytics */}
        <g transform="translate(968, 840)"><ChartIcon size={28} color="#CE93D8" /></g>
        <text x={1010} y={852} fill={C.white} fontSize={9} fontWeight="700" fontFamily="system-ui,sans-serif">Log Analytics</text>
        <text x={1010} y={864} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">log-afaf-dev</text>
        <text x={1010} y={876} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">PerGB2018 · 30d (dev)</text>
        <text x={1010} y={888} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">90d retention (prod)</text>

        {/* App Insights */}
        <g transform="translate(1155, 840)"><BarChartIcon size={28} color="#CE93D8" /></g>
        <text x={1197} y={852} fill={C.white} fontSize={9} fontWeight="700" fontFamily="system-ui,sans-serif">Application Insights</text>
        <text x={1197} y={864} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">appi-afaf-dev</text>
        <text x={1197} y={876} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Distributed tracing</text>
        <text x={1197} y={888} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Live Metrics stream</text>

        {/* Azure Monitor */}
        <g transform="translate(1355, 840)"><ChartIcon size={28} color="#CE93D8" /></g>
        <text x={1397} y={852} fill={C.white} fontSize={9} fontWeight="700" fontFamily="system-ui,sans-serif">Azure Monitor</text>
        <text x={1397} y={864} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="system-ui,sans-serif">Alerts + Dashboards</text>

        {/* Alerts */}
        <rect x={1480} y={832} width={228} height={60} rx={6}
          fill="rgba(106,27,154,0.2)" stroke={C.monitorPurple} strokeWidth={1} />
        <text x={1594} y={848} textAnchor="middle" fill="#CE93D8" fontSize={8.5} fontWeight="600" fontFamily="system-ui,sans-serif">🔔 Alert Rules</text>
        <text x={1594} y={862} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">API error rate &gt;5% → SEV2</text>
        <text x={1594} y={874} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">15min evaluation window</text>
        <text x={1594} y={886} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8} fontFamily="system-ui,sans-serif">Metric: failedRequests count</text>

        {/* structlog note */}
        <rect x={968} y={908} width={742} height={26} rx={5}
          fill="rgba(106,27,154,0.15)" stroke="rgba(206,147,216,0.3)" strokeWidth={1} />
        <text x={1339} y={925} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8.5} fontFamily="system-ui,sans-serif">
          structlog · Correlation IDs · Request timing middleware · /health liveness + readiness probes
        </text>

        {/* ══════════════════════════════════════════════════════════════════════
            ARROWS
        ════════════════════════════════════════════════════════════════════════ */}

        {/* User → nginx */}
        <path d="M75 148 L75 218" fill="none" stroke={C.docker} strokeWidth={2} markerEnd="url(#arrow-blue)" />
        <text x={82} y={192} fill={C.docker} fontSize={8} fontFamily="system-ui,sans-serif">HTTP :3000</text>

        {/* User → API Container App (HTTPS) */}
        <path d="M130 108 L195 136" fill="none" stroke={C.azureBlue} strokeWidth={2} strokeDasharray="5 3" markerEnd="url(#arrow-blue)" />
        <text x={150} y={120} fill={C.azureBlue} fontSize={8} fontFamily="system-ui,sans-serif">HTTPS</text>

        {/* API → Orchestrator */}
        <path d="M555 167 L555 182" fill="none" stroke={C.azureBlue} strokeWidth={2} markerEnd="url(#arrow-blue)" />

        {/* Orchestrator → Code Analyzer */}
        <path d="M307 240 L307 264" fill="none" stroke={C.green} strokeWidth={1.5} markerEnd="url(#arrow-green)" />

        {/* Orchestrator → Infra Analyzer */}
        <path d="M547 240 L547 264" fill="none" stroke={C.orange} strokeWidth={1.5} markerEnd="url(#arrow-orange)" />

        {/* Orchestrator → Cost Optimizer */}
        <path d="M307 240 L307 372 L307 396" fill="none" stroke={C.purple} strokeWidth={1.5} strokeDasharray="4 2" markerEnd="url(#arrow-purple)" />

        {/* Orchestrator → Migration Planner */}
        <path d="M547 240 L547 372 L547 396" fill="none" stroke={C.red} strokeWidth={1.5} strokeDasharray="4 2" markerEnd="url(#arrow-red)" />

        {/* Orchestrator → GAP Analyzer */}
        <path d="M400" y1={240} />
        <path d="M400 240 L410 240 L410 504 L307 504 L307 528" fill="none" stroke={C.deepOrange} strokeWidth={1.5} strokeDasharray="4 2" markerEnd="url(#arrow-red)" />

        {/* Orchestrator → WAF Reviewer */}
        <path d="M600 240 L610 240 L610 504 L547 504 L547 528" fill="none" stroke={C.blueGrey} strokeWidth={1.5} strokeDasharray="4 2" markerEnd="url(#arrow-white)" />

        {/* All agents → Report */}
        <path d="M307 372 L307 640 L307 656" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} markerEnd="url(#arrow-white)" />
        <path d="M547 372 L547 640 L547 656" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} markerEnd="url(#arrow-white)" />
        <path d="M307 636 L307 656" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} markerEnd="url(#arrow-white)" />
        <path d="M547 636 L547 656" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} markerEnd="url(#arrow-white)" />

        {/* Orchestrator → Azure OpenAI */}
        <path d="M870 211 L958 211 L958 163 L1138 163" fill="none" stroke={C.azureBlue} strokeWidth={2} strokeDasharray="5 3" markerEnd="url(#arrow-blue)" />
        <text x={944} y={207} fill={C.azureBlue} fontSize={8} fontStyle="italic" fontFamily="system-ui,sans-serif">GPT-4o</text>

        {/* Migration → AI Search (RAG) */}
        <path d="M660 450 L870 450 L870 280 L1440 280" fill="none" stroke="rgba(80,230,255,0.5)" strokeWidth={1.5} strokeDasharray="4 2" markerEnd="url(#arrow-blue)" />
        <text x={1050} y={270} fill={C.azureLight} fontSize={8} fontStyle="italic" fontFamily="system-ui,sans-serif">RAG</text>

        {/* WAF → AI Search (RAG) */}
        <path d="M660 582 L880 582 L880 290 L1440 290" fill="none" stroke="rgba(80,230,255,0.35)" strokeWidth={1.5} strokeDasharray="4 2" markerEnd="url(#arrow-blue)" />

        {/* AI Hub → AI Project connection */}
        <path d="M1123 165 L1138 165" fill="none" stroke={C.azureBlue} strokeWidth={1.5} markerEnd="url(#arrow-blue)" />

        {/* AI Project → OpenAI */}
        <path d="M1210 165 L1210 155 L1240 155" fill="none" stroke={C.azureBlue} strokeWidth={1.5} markerEnd="url(#arrow-blue)" />
        <text x={1218} y={151} fill="rgba(255,255,255,0.5)" fontSize={7} fontFamily="system-ui,sans-serif">conn-openai</text>

        {/* AI Project → AI Search */}
        <path d="M1210 185 L1210 200 L1440 200" fill="none" stroke={C.azureBlue} strokeWidth={1.5} markerEnd="url(#arrow-blue)" />
        <text x={1300} y={196} fill="rgba(255,255,255,0.5)" fontSize={7} fontFamily="system-ui,sans-serif">conn-search</text>

        {/* API → Cosmos DB */}
        <path d="M555 167 L555 808 L555 780 L1000 680 L1000 600" fill="none" stroke={C.amber} strokeWidth={1.5} strokeDasharray="5 3" markerEnd="url(#arrow-amber)" />
        <text x={840} y={710} fill={C.amber} fontSize={8} fontStyle="italic" fontFamily="system-ui,sans-serif">Sessions/Reports</text>

        {/* API → Key Vault */}
        <path d="M870 136 L1358 136 L1358 570" fill="none" stroke="rgba(198,40,40,0.5)" strokeWidth={1} strokeDasharray="4 2" markerEnd="url(#arrow-red)" />
        <text x={1110} y={130} fill="rgba(239,154,154,0.7)" fontSize={8} fontStyle="italic" fontFamily="system-ui,sans-serif">KV Reference</text>

        {/* Container Apps → Log Analytics */}
        <path d="M555 167 L555 960 L1000 960 L1000 876" fill="none" stroke="rgba(206,147,216,0.4)" strokeWidth={1} strokeDasharray="4 2" markerEnd="url(#arrow-purple)" />
        <text x={720} y={958} fill="rgba(206,147,216,0.6)" fontSize={8} fontStyle="italic" fontFamily="system-ui,sans-serif">Logs/Metrics</text>

        {/* ══════════════════════════════════════════════════════════════════════
            LEGEND
        ════════════════════════════════════════════════════════════════════════ */}
        <rect x={20} y={820} width={130} height={240} rx={8}
          fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <text x={85} y={836} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={9} fontWeight="700" fontFamily="system-ui,sans-serif">Legend</text>

        {[
          { color: C.green,       label: 'Code Analyzer' },
          { color: C.orange,      label: 'Infra Analyzer' },
          { color: C.purple,      label: 'Cost Optimizer' },
          { color: C.red,         label: 'Migration Planner' },
          { color: C.deepOrange,  label: 'GAP Analyzer' },
          { color: C.blueGrey,    label: 'WAF Reviewer' },
          { color: C.azureBlue,   label: 'Azure Services' },
          { color: C.docker,      label: 'Docker/Local' },
        ].map(({ color, label }, i) => (
          <g key={label}>
            <rect x={30} y={846 + i * 24} width={14} height={14} rx={3} fill={color} />
            <text x={50} y={858 + i * 24} fill="rgba(255,255,255,0.7)" fontSize={8.5} fontFamily="system-ui,sans-serif">{label}</text>
          </g>
        ))}

      </svg>
    </div>
  )
}

export default ArchitectureDiagram
