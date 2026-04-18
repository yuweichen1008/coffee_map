import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'

// ── Scroll-reveal ─────────────────────────────────────────────────────────────
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect() } }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return { ref, visible }
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, prefix = '', suffix = '', dur = 1600 }: { to: number; prefix?: string; suffix?: string; dur?: number }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      let t0: number | null = null
      const tick = (ts: number) => {
        if (!t0) t0 = ts
        const p = Math.min((ts - t0) / dur, 1)
        setVal(Math.round((1 - Math.pow(1 - p, 3)) * to))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [to, dur])
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>
}

// ── Signal Matrix data ────────────────────────────────────────────────────────
const MATRIX = [
  { cat: 'Coffee Shop',       color: '#ea580c', signal: 'Knowledge worker density',     insight: 'Target B2B, co-working, premium lunch',      emoji: '☕' },
  { cat: 'Convenience Store', color: '#3b82f6', signal: 'Residential population proxy', insight: 'Family services, FMCG, last-mile logistics',   emoji: '🏪' },
  { cat: 'Hawker / Kopitiam', color: '#eab308', signal: 'Blue-collar workforce density', insight: 'Value F&B wins; kopitiam = captive lunch trade', emoji: '🍜' },
  { cat: 'Supermarket',       color: '#10b981', signal: 'Income bracket indicator',      insight: 'Cold Storage = premium; absence = supply gap',  emoji: '🛒' },
  { cat: 'Pharmacy',          color: '#ec4899', signal: 'Aging / family demographic',   insight: 'Healthcare adjacent, nutraceuticals, optical',  emoji: '💊' },
  { cat: 'Gym / Fitness',     color: '#8b5cf6', signal: 'Young professional density',   insight: 'Premium services, health food, activewear',     emoji: '💪' },
  { cat: 'Co-working',        color: '#0ea5e9', signal: 'Startup / freelancer density', insight: 'Tech services, SaaS, B2B tools',                emoji: '💻' },
  { cat: 'Childcare / Tuition', color: '#f43f5e', signal: 'Families with young children', insight: 'Education, parenting retail, family dining',  emoji: '🧒' },
  { cat: 'Bakery',            color: '#f59e0b', signal: 'Gentrification front index',   insight: 'Boutique bakery surge = rents rising in 12 mo', emoji: '🥐' },
  { cat: 'Bubble Tea',        color: '#06b6d4', signal: 'Youth + foot traffic volume',  insight: 'MRT-adjacent or school catchment; impulse buy',  emoji: '🧋' },
  { cat: 'Restaurant',        color: '#a855f7', signal: 'Evening economy strength',     insight: 'Entertainment zone after 6 pm; nightlife signal', emoji: '🍽️' },
  { cat: 'Laundromat',        color: '#64748b', signal: 'Rental-heavy / transient area', insight: 'Migrant worker zone; avoid luxury positioning',  emoji: '👕' },
  { cat: 'Grocery Store',     color: '#22c55e', signal: 'Residential self-sufficiency', insight: 'Absence = underserved estate; supply opportunity', emoji: '🥦' },
]

// ── Dead-zone SVG visual ──────────────────────────────────────────────────────
function DeadZoneVisual() {
  const cells: { x: number; y: number; type: 'active' | 'dead' | 'empty' }[] = [
    {x:0,y:0,type:'active'},{x:1,y:0,type:'active'},{x:2,y:0,type:'empty'},{x:3,y:0,type:'active'},{x:4,y:0,type:'active'},
    {x:0,y:1,type:'active'},{x:1,y:1,type:'dead'},  {x:2,y:1,type:'dead'}, {x:3,y:1,type:'active'},{x:4,y:1,type:'empty'},
    {x:0,y:2,type:'empty'},{x:1,y:2,type:'dead'},   {x:2,y:2,type:'dead'}, {x:3,y:2,type:'dead'}, {x:4,y:2,type:'active'},
    {x:0,y:3,type:'active'},{x:1,y:3,type:'active'},{x:2,y:3,type:'dead'}, {x:3,y:3,type:'active'},{x:4,y:3,type:'active'},
    {x:0,y:4,type:'active'},{x:1,y:4,type:'empty'},{x:2,y:4,type:'active'},{x:3,y:4,type:'active'},{x:4,y:4,type:'empty'},
  ]
  return (
    <div className="relative">
      <svg viewBox="0 0 130 130" className="w-full max-w-[260px] mx-auto">
        {cells.map(({ x, y, type }) => (
          <rect key={`${x}-${y}`}
            x={x * 26 + 1} y={y * 26 + 1} width={24} height={24} rx={3}
            fill={type === 'dead' ? '#7f1d1d' : type === 'active' ? '#1e3a5f' : '#111827'}
            stroke={type === 'dead' ? '#ef4444' : type === 'active' ? '#3b82f6' : '#1f2937'}
            strokeWidth={0.8}
            opacity={type === 'empty' ? 0.3 : 1}
          />
        ))}
        {/* Pulse ring on dead zone cluster center */}
        <circle cx={65} cy={65} r={28} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.4} strokeDasharray="4 3" />
      </svg>
      <div className="flex justify-center gap-6 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-blue-900 border border-blue-500" />Active store</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-950 border border-red-500" />Closed / failed</span>
      </div>
    </div>
  )
}

// ── Main pitch page ───────────────────────────────────────────────────────────
export default function Pitch() {
  const [stats, setStats] = useState({ active_stores: 0, closed_tracked: 0, categories: 13, districts: 31, cities: 2 })

  useEffect(() => {
    fetch('/api/pitch-stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  const hero    = useReveal(0)
  const problem = useReveal()
  const matrix  = useReveal()
  const dead    = useReveal()
  const moat    = useReveal()
  const model   = useReveal()
  const market  = useReveal()
  const ask     = useReveal()

  return (
    <>
      <Head>
        <title>StorePulse — Investor Snapshot</title>
        <meta name="description" content="Location intelligence for Southeast Asian retail — preventing the SGD 200K bad-location mistake." />
      </Head>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-xl border-b border-white/8">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <span className="text-white font-bold text-sm">StorePulse</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/map" className="text-gray-400 hover:text-white text-sm transition">Live Map</Link>
            <Link href="/time-machine" className="text-gray-400 hover:text-white text-sm transition">Time Machine</Link>
            <Link href="mailto:yuweiichen@gmail.com"
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-full transition">
              Contact Founder
            </Link>
          </div>
        </div>
      </nav>

      <div className="bg-black text-white min-h-screen pt-16">

        {/* ━━━━━━━━━━━━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="relative min-h-screen flex flex-col justify-center items-center text-center px-6 py-20 overflow-hidden">
          {/* Radial glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full"
              style={{ background: 'radial-gradient(ellipse, rgba(249,115,22,0.12) 0%, rgba(239,68,68,0.05) 45%, transparent 70%)' }} />
            <div className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          </div>

          <div ref={hero.ref} className="relative z-10 max-w-4xl"
            style={{ opacity: hero.visible ? 1 : 0, transform: hero.visible ? 'none' : 'translateY(28px)', transition: 'opacity 0.9s ease, transform 0.9s ease' }}>

            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 rounded-full px-4 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-orange-300 text-xs font-semibold tracking-wider uppercase">Live · 2 Cities · Real Data</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6">
              Every bad location<br />costs
              <span className="text-transparent bg-clip-text ml-3"
                style={{ backgroundImage: 'linear-gradient(135deg, #f97316, #ef4444)' }}>
                SGD 200K.
              </span>
              <br />
              <span className="text-gray-300">We prevent that.</span>
            </h1>

            <p className="text-xl text-gray-400 font-light max-w-2xl mx-auto leading-relaxed mb-12">
              StorePulse is the only location intelligence platform in Southeast Asia that maps
              <strong className="text-white"> store closures as a risk signal</strong>,
              cross-references government business registries, and packages insights into a
              repeatable decision framework for retail operators.
            </p>

            {/* Live stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-3xl mx-auto">
              {[
                { label: 'Stores tracked', value: stats.active_stores, suffix: '+' },
                { label: 'Failure clusters mapped', value: stats.closed_tracked, suffix: '' },
                { label: 'Signal categories', value: stats.categories, suffix: '' },
                { label: 'Districts covered', value: stats.districts, suffix: '' },
              ].map(({ label, value, suffix }) => (
                <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className="text-3xl font-black text-white mb-1">
                    {value > 0 ? <Counter to={value} suffix={suffix} /> : '—'}
                  </div>
                  <div className="text-xs text-gray-500 leading-snug">{label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/map"
                className="px-8 py-4 bg-orange-500 text-white rounded-full font-bold text-base hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/20">
                See the Live Map
              </Link>
              <Link href="/time-machine"
                className="px-8 py-4 bg-white/8 text-white rounded-full font-semibold text-base border border-white/12 hover:bg-white/12 active:scale-95 transition-all">
                Time Machine Demo
              </Link>
            </div>
          </div>

          {/* Scroll cue */}
          <div className="absolute bottom-8 flex flex-col items-center gap-2 opacity-30">
            <div className="w-px h-10 bg-gradient-to-b from-white/50 to-transparent animate-pulse" />
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━ PROBLEM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-24 px-6 border-t border-white/8">
          <div ref={problem.ref} className="max-w-5xl mx-auto"
            style={{ opacity: problem.visible ? 1 : 0, transform: problem.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>

            <div className="text-center mb-16">
              <p className="text-xs font-bold tracking-widest uppercase text-red-400 mb-3">The Problem</p>
              <h2 className="text-4xl md:text-5xl font-black mb-5">
                60% of F&B businesses<br />fail in Year 1 in Singapore
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto">Bad location is the #1 cause. Bad data is the root problem. Business owners are making SGD 200K decisions based on gut feel and a walk-around.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { num: '60%', label: 'F&B failure rate in Year 1', sub: 'Singapore MOM / IE Singapore data', color: '#ef4444' },
                { num: 'SGD 200K', label: 'Average wasted on a bad location', sub: 'Fit-out + rent + stock before closure', color: '#f97316' },
                { num: '3 weeks', label: 'Time spent on manual location research', sub: 'Walking, counting, guessing', color: '#eab308' },
              ].map(({ num, label, sub, color }) => (
                <div key={num} className="bg-white/4 border border-white/8 rounded-2xl p-6 text-center">
                  <div className="text-4xl font-black mb-2" style={{ color }}>{num}</div>
                  <div className="text-white font-semibold mb-1 text-sm">{label}</div>
                  <div className="text-gray-500 text-xs">{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━ SIGNAL MATRIX ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-24 px-6 border-t border-white/8 bg-white/[0.02]">
          <div ref={matrix.ref} className="max-w-6xl mx-auto"
            style={{ opacity: matrix.visible ? 1 : 0, transform: matrix.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>

            <div className="text-center mb-14">
              <p className="text-xs font-bold tracking-widest uppercase text-orange-400 mb-3">Core IP — The Framework</p>
              <h2 className="text-4xl md:text-5xl font-black mb-5">Store Intelligence Matrix</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Every store type is a demographic and economic signal. The ratio between categories reveals neighbourhood archetypes
                that no single data point can show. <strong className="text-white">This framework is the consulting deliverable.</strong>
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {MATRIX.map(({ cat, color, signal, insight, emoji }, i) => (
                <div key={cat}
                  className="group bg-white/4 border border-white/8 rounded-xl p-4 hover:border-white/20 hover:bg-white/6 transition-all duration-300"
                  style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-2xl">{emoji}</span>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  </div>
                  <div className="text-sm font-bold text-white mb-1">{cat}</div>
                  <div className="text-xs font-semibold mb-2" style={{ color }}>{signal}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{insight}</div>
                </div>
              ))}
            </div>

            {/* Cross-ratio examples */}
            <div className="mt-10 grid md:grid-cols-2 gap-4">
              <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-5">
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Cross-Ratio Signal: CBD Pattern</div>
                <div className="text-sm text-gray-300">
                  <strong className="text-white">High coffee : low convenience</strong> → Pure commercial zone. Office workers dominate. No night economy. Target: B2B services, premium grab-and-go.
                </div>
              </div>
              <div className="bg-green-950/30 border border-green-500/20 rounded-xl p-5">
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">Cross-Ratio Signal: Family Heartland</div>
                <div className="text-sm text-gray-300">
                  <strong className="text-white">High convenience + high childcare + zero coworking</strong> → HDB family estate. Target: enrichment centres, family dining, after-school services.
                </div>
              </div>
              <div className="bg-purple-950/30 border border-purple-500/20 rounded-xl p-5">
                <div className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">Cross-Ratio Signal: Startup District</div>
                <div className="text-sm text-gray-300">
                  <strong className="text-white">Coworking + cafe + boba surge</strong> → Emerging startup zone. Target: tech services, design studios, productivity tools.
                </div>
              </div>
              <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-5">
                <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Cross-Ratio Signal: Risk Zone</div>
                <div className="text-sm text-gray-300">
                  <strong className="text-white">Laundromat + hawker cluster + no supermarket</strong> → Migrant worker dormitory zone. Avoid premium retail; pivot to budget services.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━ DEAD ZONES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-24 px-6 border-t border-white/8">
          <div ref={dead.ref} className="max-w-5xl mx-auto"
            style={{ opacity: dead.visible ? 1 : 0, transform: dead.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>

            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-xs font-bold tracking-widest uppercase text-red-400 mb-3">Unique Feature #1</p>
                <h2 className="text-4xl font-black mb-5">Dead Zones</h2>
                <p className="text-gray-400 leading-relaxed mb-6">
                  Every competitor shows what&apos;s open. <strong className="text-white">We specifically map what failed.</strong><br /><br />
                  A cluster of permanently closed stores in a grid cell is a leading indicator of structural problems:
                  rent too high relative to foot traffic, wrong catchment demographics, or an entrenched competitor.
                </p>
                <div className="space-y-3">
                  {[
                    'Dead zone cluster + declining openings → Area in structural decline. Avoid.',
                    'Dead zone cluster + new openings resuming → Post-correction recovery. Ideal entry.',
                    'Isolated dead stores in dense area → One-off failure. No systemic risk.',
                  ].map(text => (
                    <div key={text} className="flex gap-3 text-sm text-gray-400">
                      <span className="text-red-400 mt-0.5 shrink-0">→</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <DeadZoneVisual />
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━ MOAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-24 px-6 border-t border-white/8 bg-white/[0.02]">
          <div ref={moat.ref} className="max-w-5xl mx-auto"
            style={{ opacity: moat.visible ? 1 : 0, transform: moat.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>

            <div className="text-center mb-14">
              <p className="text-xs font-bold tracking-widest uppercase text-orange-400 mb-3">Competitive Moat</p>
              <h2 className="text-4xl md:text-5xl font-black mb-5">3 Unfair Advantages</h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                None of these can be replicated over a weekend. Each requires months of data accumulation or non-trivial engineering.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  num: '01',
                  title: 'Dead Zone Intelligence',
                  color: '#ef4444',
                  icon: '🗺️',
                  body: 'The only retail map in SEA that tracks permanently-closed stores as a risk signal. Every month the pipeline runs, the historical baseline deepens. A competitor starting today needs 2+ years to replicate this.',
                  tag: 'Data moat — compounds monthly',
                },
                {
                  num: '02',
                  title: 'Government Data Reconciliation',
                  color: '#f97316',
                  icon: '🏛️',
                  body: 'We cross-reference Google Places with official business registries (Taiwan GCIS, Singapore ACRA/data.gov.sg) using fuzzy name matching + spatial proximity. Catches closures Google hasn\'t detected yet.',
                  tag: 'Engineering moat — non-trivial to build',
                },
                {
                  num: '03',
                  title: 'The Framework Is the Product',
                  color: '#8b5cf6',
                  icon: '🧠',
                  body: 'Competitors sell maps. We sell a decision framework. The Store Intelligence Matrix creates client dependency — once operators understand the lens, they keep coming back for new situations.',
                  tag: 'Consulting moat — methodology lock-in',
                },
              ].map(({ num, title, color, icon, body, tag }) => (
                <div key={num} className="bg-white/4 border border-white/8 rounded-2xl p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{icon}</span>
                    <span className="text-4xl font-black opacity-20" style={{ color }}>{num}</span>
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{body}</p>
                  </div>
                  <div className="mt-auto pt-3 border-t border-white/8">
                    <span className="text-xs font-semibold" style={{ color }}>{tag}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* vs competitors */}
            <div className="mt-12 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-gray-500 font-semibold text-xs uppercase tracking-wider">Capability</th>
                    {['StorePulse', 'Google Maps', 'CBRE/JLL', 'Placer.ai'].map(h => (
                      <th key={h} className={`py-3 px-4 text-xs uppercase tracking-wider font-semibold ${h === 'StorePulse' ? 'text-orange-400' : 'text-gray-500'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Dead zone / closure clusters',      '✓', '✗', '~', '✗'],
                    ['Government data reconciliation',    '✓', '✗', '~', '✗'],
                    ['Historical time-series trends',     '✓', '✗', '✓', '~'],
                    ['Cross-category signal ratios',      '✓', '✗', '✗', '✗'],
                    ['SEA / Singapore native',            '✓', '~', '~', '✗'],
                    ['SME-accessible price point',        '✓', '✓', '✗', '✗'],
                  ].map(([cap, ...vals]) => (
                    <tr key={cap} className="border-b border-white/5 hover:bg-white/3 transition">
                      <td className="py-3 px-4 text-gray-400 text-xs">{cap}</td>
                      {vals.map((v, i) => (
                        <td key={i} className={`py-3 px-4 text-center font-bold text-sm ${v === '✓' && i === 0 ? 'text-green-400' : v === '✓' ? 'text-gray-300' : v === '~' ? 'text-yellow-600' : 'text-gray-700'}`}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━ BUSINESS MODEL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-24 px-6 border-t border-white/8">
          <div ref={model.ref} className="max-w-5xl mx-auto"
            style={{ opacity: model.visible ? 1 : 0, transform: model.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>

            <div className="text-center mb-14">
              <p className="text-xs font-bold tracking-widest uppercase text-orange-400 mb-3">Business Model</p>
              <h2 className="text-4xl md:text-5xl font-black mb-5">4 Revenue Streams</h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                Consulting generates cash today. SaaS scales it. Enterprise locks in the moat.
                Each tier is a natural upgrade path from the one before.
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              {[
                { tier: 'District Brief', price: 'SGD 300–500', freq: 'per report', who: 'Solo entrepreneurs, first-time F&B operators', items: ['1–2 page PDF', 'Density map', 'Top 3 signals', '3 risk zones', '24hr turnaround'], color: '#3b82f6' },
                { tier: 'Full Location Report', price: 'SGD 1,500–3,000', freq: 'per report', who: 'F&B operators, franchise seekers', items: ['12-page analysis', 'All 13 signals scored', 'Time Machine trend', '3 competitor profiles', '"Open here?" verdict'], color: '#f97316', featured: true },
                { tier: 'Strategic Area Study', price: 'SGD 5K–12K', freq: 'per engagement', who: 'Retail chains, F&B groups', items: ['Multi-district study', 'Site selection shortlist', 'Rent benchmark guide', '12-month forecast', 'Ground validation'], color: '#8b5cf6' },
                { tier: 'Retainer', price: 'SGD 2K–5K', freq: '/ month', who: 'Franchise chains, property funds', items: ['Monthly signal refresh', 'Dead zone alerts', 'Competitor tracking', 'Priority turnaround', 'Direct analyst access'], color: '#10b981' },
              ].map(({ tier, price, freq, who, items, color, featured }) => (
                <div key={tier}
                  className={`rounded-2xl p-5 flex flex-col gap-4 border ${featured ? 'bg-orange-500/8 border-orange-500/30' : 'bg-white/4 border-white/8'}`}>
                  {featured && <div className="text-xs font-bold text-orange-400 uppercase tracking-wider">Most popular</div>}
                  <div>
                    <div className="text-white font-bold text-base mb-1">{tier}</div>
                    <div className="font-black text-2xl" style={{ color }}>{price}</div>
                    <div className="text-gray-500 text-xs">{freq}</div>
                  </div>
                  <div className="text-xs text-gray-500 italic">{who}</div>
                  <ul className="space-y-1.5 flex-1">
                    {items.map(item => (
                      <li key={item} className="flex items-start gap-2 text-xs text-gray-400">
                        <span style={{ color }} className="mt-0.5 shrink-0">✓</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━ MARKET ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-24 px-6 border-t border-white/8 bg-white/[0.02]">
          <div ref={market.ref} className="max-w-5xl mx-auto"
            style={{ opacity: market.visible ? 1 : 0, transform: market.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>

            <div className="text-center mb-14">
              <p className="text-xs font-bold tracking-widest uppercase text-orange-400 mb-3">Market Opportunity</p>
              <h2 className="text-4xl md:text-5xl font-black mb-5">Singapore First.<br />SEA Next.</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-12">
              {[
                { label: 'TAM — SEA SMEs needing location intel', value: 'USD 1.8B', sub: '5M+ SMEs × USD 360/yr avg', color: '#f97316' },
                { label: 'SAM — Singapore F&B + Retail operators', value: 'SGD 180M', sub: '~90K operators × SGD 2K/yr avg', color: '#3b82f6' },
                { label: 'SOM — Year 1 target (consulting + SaaS)', value: 'SGD 500K', sub: '~250 clients, SGD 1K–5K avg', color: '#10b981' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="text-center p-6 bg-white/4 border border-white/8 rounded-2xl">
                  <div className="text-4xl font-black mb-2" style={{ color }}>{value}</div>
                  <div className="text-white font-semibold text-sm mb-1">{label}</div>
                  <div className="text-gray-500 text-xs">{sub}</div>
                </div>
              ))}
            </div>

            {/* Expansion path */}
            <div className="bg-white/4 border border-white/8 rounded-2xl p-6">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Expansion Path — same codebase, new city coordinates</div>
              <div className="flex flex-wrap gap-3">
                {[
                  { city: '🇸🇬 Singapore', status: 'Live', color: '#10b981' },
                  { city: '🇹🇼 Taipei', status: 'Live', color: '#10b981' },
                  { city: '🇲🇾 Kuala Lumpur', status: 'Q3 2026', color: '#f97316' },
                  { city: '🇹🇭 Bangkok', status: 'Q4 2026', color: '#f97316' },
                  { city: '🇮🇩 Jakarta', status: '2027', color: '#6b7280' },
                  { city: '🇵🇭 Manila', status: '2027', color: '#6b7280' },
                ].map(({ city, status, color }) => (
                  <div key={city} className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-full px-4 py-2">
                    <span className="text-sm text-white font-medium">{city}</span>
                    <span className="text-xs font-semibold" style={{ color }}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━ THE ASK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="py-24 px-6 border-t border-white/8">
          <div ref={ask.ref} className="max-w-4xl mx-auto text-center"
            style={{ opacity: ask.visible ? 1 : 0, transform: ask.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>

            <p className="text-xs font-bold tracking-widest uppercase text-orange-400 mb-3">Pre-Seed Round</p>
            <h2 className="text-4xl md:text-5xl font-black mb-5">
              Raising{' '}
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #f97316, #ef4444)' }}>
                SGD 400,000
              </span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-12">
              18 months of runway to build self-serve SaaS, expand to KL + Bangkok, and hire the first two team members.
            </p>

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              {[
                { item: 'Data Engineer', amount: 'SGD 120K', detail: '18 months — automate pipeline refresh + SG gov data' },
                { item: 'Sales / BD', amount: 'SGD 90K', detail: '12 months — Singapore SME outreach, channel partners' },
                { item: 'SaaS Product', amount: 'SGD 80K', detail: 'Self-serve Tier 1 web product, contract dev + design' },
                { item: 'Ops + Marketing', amount: 'SGD 110K', detail: 'Infrastructure, content, founder runway, legal' },
              ].map(({ item, amount, detail }) => (
                <div key={item} className="bg-white/4 border border-white/8 rounded-xl p-4 text-left">
                  <div className="text-white font-bold text-sm mb-0.5">{item}</div>
                  <div className="text-orange-400 font-black text-xl mb-2">{amount}</div>
                  <div className="text-gray-500 text-xs leading-relaxed">{detail}</div>
                </div>
              ))}
            </div>

            {/* 18-month milestones */}
            <div className="bg-white/4 border border-white/8 rounded-2xl p-6 mb-10 text-left">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">18-Month Series A Targets</div>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { target: 'SGD 25K MRR', detail: 'Mix of SaaS subscriptions + consulting retainers' },
                  { target: '3 Enterprise Clients', detail: 'Franchise chains or property funds on retainer' },
                  { target: '3 SEA Cities Live', detail: 'Singapore, Kuala Lumpur, Bangkok with full dataset' },
                ].map(({ target, detail }) => (
                  <div key={target}>
                    <div className="text-white font-bold text-lg mb-1">{target}</div>
                    <div className="text-gray-500 text-xs">{detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <Link href="mailto:yuweiichen@gmail.com"
              className="inline-flex items-center gap-3 px-10 py-4 bg-orange-500 text-white rounded-full font-bold text-lg hover:bg-orange-600 active:scale-95 transition-all shadow-xl shadow-orange-500/20">
              Talk to the Founder
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/8 py-8 px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-5 h-5 bg-orange-500 rounded-md flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <span className="text-white font-bold text-sm">StorePulse</span>
          </div>
          <p className="text-gray-600 text-xs">Location intelligence for Southeast Asian retail. Built in Singapore.</p>
          <div className="flex justify-center gap-6 mt-4">
            <Link href="/map" className="text-gray-600 hover:text-gray-400 text-xs transition">Live Map</Link>
            <Link href="/time-machine" className="text-gray-600 hover:text-gray-400 text-xs transition">Time Machine</Link>
            <Link href="/pitch" className="text-gray-600 hover:text-gray-400 text-xs transition">Investor Deck</Link>
          </div>
        </footer>
      </div>
    </>
  )
}
