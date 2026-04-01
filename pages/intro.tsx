import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Head from 'next/head'

// ── Types ─────────────────────────────────────────────────────────────────────
type Section = {
  id: string
  eyebrow: string
  headline: string
  sub: string
  detail: string
  cta?: { label: string; href: string }
  visual: React.ReactNode
  dark: boolean
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        observer.disconnect()
        let start: number | null = null
        const step = (ts: number) => {
          if (!start) start = ts
          const prog = Math.min((ts - start) / 1200, 1)
          setVal(Math.round(prog * to))
          if (prog < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      },
      { threshold: 0.5 },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [to])
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>
}

// ── Map preview SVG ───────────────────────────────────────────────────────────
function MapPreview({ dark }: { dark: boolean }) {
  const dots = [
    [40, 60], [70, 45], [55, 75], [85, 55], [30, 80],
    [60, 30], [90, 70], [20, 50], [75, 85], [45, 40],
    [65, 60], [50, 90], [80, 35], [35, 70], [95, 50],
  ]
  return (
    <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
      {/* Grid */}
      {[20,40,60,80,100].map(x => (
        <line key={`vg${x}`} x1={x} y1={0} x2={x} y2={120}
          stroke={dark ? '#ffffff08' : '#00000008'} strokeWidth="1" />
      ))}
      {[20,40,60,80,100].map(y => (
        <line key={`hg${y}`} x1={0} y1={y} x2={120} y2={y}
          stroke={dark ? '#ffffff08' : '#00000008'} strokeWidth="1" />
      ))}
      {/* Heatmap blobs */}
      <circle cx="60" cy="55" r="28" fill="rgba(239,68,68,0.12)" />
      <circle cx="60" cy="55" r="16" fill="rgba(239,68,68,0.18)" />
      <circle cx="40" cy="70" r="20" fill="rgba(59,130,246,0.10)" />
      <circle cx="40" cy="70" r="10" fill="rgba(59,130,246,0.16)" />
      {/* Dots */}
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2.5"
          fill={i < 6 ? '#ef4444' : '#3b82f6'} opacity="0.85" />
      ))}
      {/* Highlight */}
      <circle cx="60" cy="55" r="5" fill="white" opacity="0.9" />
      <circle cx="60" cy="55" r="8" fill="none" stroke="#ef4444" strokeWidth="1.5" />
    </svg>
  )
}

// ── Trend chart SVG ───────────────────────────────────────────────────────────
function TrendChart({ dark }: { dark: boolean }) {
  const pts = [10, 18, 14, 25, 20, 35, 30, 42, 38, 55, 50, 65]
  const max = 65
  const w = 120, h = 80
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * (w - 20) + 10)
  const ys = pts.map(p => h - 10 - (p / max) * (h - 20))
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  const areaD = pathD + ` L${xs[xs.length-1]},${h-10} L${xs[0]},${h-10} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#tg)" />
      <path d={pathD} stroke="#f97316" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="2" fill="#f97316" />
      ))}
      {/* Axes */}
      <line x1="10" y1={h-10} x2={w-10} y2={h-10}
        stroke={dark ? '#ffffff20' : '#00000015'} strokeWidth="1" />
    </svg>
  )
}

// ── Platform bubbles visual ───────────────────────────────────────────────────
function PlatformBubbles() {
  const bubbles = [
    { emoji: '📸', label: 'Instagram', color: '#E1306C', cx: 50, cy: 45, r: 22, score: 87 },
    { emoji: '🎵', label: 'TikTok',    color: '#69C9D0', cx: 85, cy: 30, r: 16, score: 72 },
    { emoji: '👥', label: 'Facebook',  color: '#1877F2', cx: 80, cy: 70, r: 14, score: 61 },
    { emoji: '🧵', label: 'Threads',   color: '#a78bfa', cx: 25, cy: 75, r: 12, score: 54 },
    { emoji: '💬', label: 'LINE',      color: '#00B900', cx: 18, cy: 35, r: 10, score: 48 },
  ]
  return (
    <svg viewBox="0 0 110 110" className="w-full h-full">
      {bubbles.map(b => (
        <g key={b.label}>
          <circle cx={b.cx} cy={b.cy} r={b.r + 4}
            fill={b.color} opacity="0.12" />
          <circle cx={b.cx} cy={b.cy} r={b.r}
            fill={b.color} opacity="0.85" />
          <text x={b.cx} y={b.cy + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize={b.r * 0.85}>{b.emoji}</text>
          <text x={b.cx} y={b.cy + b.r + 6} textAnchor="middle"
            fontSize="5" fill={b.color} fontWeight="600">{b.score}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Score dial visual ─────────────────────────────────────────────────────────
function ScoreDial({ score = 78 }: { score?: number }) {
  const r = 40, cx = 60, cy = 65
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  return (
    <svg viewBox="0 0 120 100" className="w-full h-full">
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="#1e293b" strokeWidth="8" />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'}
        strokeWidth="8"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22"
        fontWeight="800" fill="white">{score}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="7"
        fill="#94a3b8">LOCATION SCORE</text>
      {/* Labels */}
      <text x="14" y="82" fontSize="6" fill="#64748b">Risk</text>
      <text x="94" y="82" fontSize="6" fill="#22c55e">Prime</text>
    </svg>
  )
}

// ── Time Machine visual ───────────────────────────────────────────────────────
function TimeVisual() {
  const years = [2015, 2017, 2019, 2021, 2023, 2025]
  const counts = [12, 28, 45, 70, 92, 110]
  const maxC = 110
  return (
    <svg viewBox="0 0 120 80" className="w-full h-full">
      <defs>
        <linearGradient id="timeg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      {years.map((yr, i) => {
        const x = 10 + i * 18
        const bh = (counts[i] / maxC) * 52
        const t = i / (years.length - 1)
        const r = Math.round(59 + t * (239 - 59))
        const g = Math.round(130 - t * (130 - 68))
        const b = Math.round(246 - t * (246 - 68))
        return (
          <g key={yr}>
            <rect x={x} y={70 - bh} width="12" height={bh} rx="2"
              fill={`rgb(${r},${g},${b})`} opacity="0.85" />
            <text x={x + 6} y={78} textAnchor="middle" fontSize="5.5"
              fill="#94a3b8">{yr}</text>
          </g>
        )
      })}
      <line x1="8" y1="70" x2="115" y2="70"
        stroke="#ffffff15" strokeWidth="1" />
    </svg>
  )
}

// ── Section hook: fade + slide on scroll ────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect() } },
      { threshold: 0.18 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, visible }
}

// ── Individual section ────────────────────────────────────────────────────────
function Section({ s, index }: { s: Section; index: number }) {
  const { ref, visible } = useReveal()
  const even = index % 2 === 0

  return (
    <section
      ref={ref}
      className={`min-h-screen flex items-center px-6 md:px-16 py-24 transition-all duration-1000 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
      } ${s.dark ? 'bg-black text-white' : 'bg-white text-gray-900'}`}
    >
      <div className={`max-w-6xl mx-auto w-full flex flex-col ${even ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-16 md:gap-24`}>

        {/* Text */}
        <div className="flex-1 max-w-xl">
          <p className={`text-xs font-bold tracking-[0.2em] uppercase mb-4 ${
            s.dark ? 'text-orange-400' : 'text-orange-500'
          }`}>{s.eyebrow}</p>
          <h2 className={`text-4xl md:text-5xl font-black leading-tight tracking-tight mb-6 ${
            s.dark ? 'text-white' : 'text-gray-900'
          }`}>{s.headline}</h2>
          <p className={`text-xl font-light mb-4 leading-relaxed ${
            s.dark ? 'text-gray-300' : 'text-gray-600'
          }`}>{s.sub}</p>
          <p className={`text-sm leading-relaxed ${
            s.dark ? 'text-gray-500' : 'text-gray-400'
          }`}>{s.detail}</p>
          {s.cta && (
            <Link
              href={s.cta.href}
              className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-orange-500 text-white rounded-full text-sm font-semibold hover:bg-orange-600 active:scale-95 transition-all"
            >
              {s.cta.label}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        {/* Visual */}
        <div className={`flex-1 flex items-center justify-center w-full max-w-sm md:max-w-md aspect-square rounded-3xl p-8 ${
          s.dark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-100'
        }`}>
          {s.visual}
        </div>

      </div>
    </section>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar() {
  const { ref, visible } = useReveal()
  return (
    <div
      ref={ref}
      className={`py-20 bg-orange-500 text-white transition-all duration-1000 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center px-6">
        {[
          { value: 4964, suffix: '+', label: 'Businesses tracked' },
          { value: 12, suffix: '', label: 'Taipei districts' },
          { value: 5, suffix: '', label: 'Social platforms' },
          { value: 100, suffix: '', label: 'Location score max' },
        ].map(s => (
          <div key={s.label}>
            <div className="text-4xl font-black tabular-nums">
              <Counter to={s.value} suffix={s.suffix} />
            </div>
            <div className="text-orange-100 text-sm mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section className="min-h-screen flex flex-col items-center justify-center bg-black text-white text-center px-6 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-3xl">
        <p className="text-orange-400 text-xs font-bold tracking-[0.25em] uppercase mb-6">
          Taipei Business Intelligence
        </p>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-6">
          Find your<br />
          <span className="text-transparent bg-clip-text"
            style={{ backgroundImage: 'linear-gradient(135deg, #f97316, #ef4444)' }}>
            perfect location.
          </span>
        </h1>
        <p className="text-xl text-gray-400 font-light max-w-xl mx-auto leading-relaxed mb-10">
          Social trends, competitor density, and demographic data — mapped
          across every district in Taipei, in seconds.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/consulting"
            className="px-8 py-4 bg-orange-500 text-white rounded-full font-semibold text-base hover:bg-orange-600 active:scale-95 transition-all"
          >
            Open Consulting Map
          </Link>
          <a
            href="#how-it-works"
            className="px-8 py-4 bg-white/10 text-white rounded-full font-semibold text-base hover:bg-white/15 active:scale-95 transition-all"
          >
            See how it works
          </a>
        </div>
      </div>

      {/* Scroll cue */}
      <div className={`absolute bottom-10 flex flex-col items-center gap-2 transition-opacity duration-500 ${scrolled ? 'opacity-0' : 'opacity-60'}`}>
        <span className="text-xs text-gray-500 tracking-widest uppercase">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-gray-600 to-transparent animate-pulse" />
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCTA() {
  const { ref, visible } = useReveal()
  return (
    <section
      ref={ref}
      className={`min-h-[60vh] flex items-center justify-center bg-black text-white text-center px-6 py-24 transition-all duration-1000 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      <div className="max-w-2xl">
        <p className="text-orange-400 text-xs font-bold tracking-[0.2em] uppercase mb-6">Ready?</p>
        <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
          Start your<br />market analysis.
        </h2>
        <p className="text-gray-400 text-lg mb-10">
          Pick a district. Choose your category. See who's trending — and where the opportunity is.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/consulting"
            className="px-8 py-4 bg-orange-500 text-white rounded-full font-semibold text-lg hover:bg-orange-600 active:scale-95 transition-all"
          >
            Open Consulting Map
          </Link>
          <Link
            href="/"
            className="px-8 py-4 bg-white/10 text-white rounded-full font-semibold text-lg hover:bg-white/15 active:scale-95 transition-all"
          >
            Explore the Map
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Sections data ─────────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    id:       'density',
    eyebrow:  'Step 1 — Understand the landscape',
    headline: 'See every competitor\nat a glance.',
    sub:      'Every active business in Taipei, mapped and categorised.',
    detail:   'Filter by coffee shops, restaurants, bakeries, or convenience stores. A heatmap shows where competition is dense — and where gaps exist. Pan across districts; the list updates in real time.',
    dark:     true,
    visual:   <MapPreview dark />,
  },
  {
    id:       'social',
    eyebrow:  'Step 2 — Read social momentum',
    headline: "Who's trending\nright now.",
    sub:      'Bubble size and colour reveal social signal strength per platform.',
    detail:   'Instagram, TikTok, Facebook, Threads, and LINE scores are pre-computed from review volume and rating. Filter by platform. Slide the minimum score to surface only the most talked-about spots.',
    dark:     false,
    visual:   <PlatformBubbles />,
  },
  {
    id:       'score',
    eyebrow:  'Step 3 — Get a location score',
    headline: 'One number.\nEvery factor.',
    sub:      'The Location Score blends social buzz, demographics, and saturation.',
    detail:   'Green (70+) means high opportunity. Yellow (40–70) is watchable. Red is oversaturated or underserved. Switch districts to compare instantly — no extra data loads.',
    dark:     true,
    visual:   <ScoreDial score={78} />,
  },
  {
    id:       'demo',
    eyebrow:  'Step 4 — Know your customer',
    headline: 'Demographics\nbuilt in.',
    sub:      'Population, age distribution, and income band — for every district.',
    detail:   'Da\'an: young professionals and students. Neihu: tech families with disposable income. Wanhua: traditional market, price-sensitive. No extra clicks — data appears in the right panel as you navigate.',
    dark:     false,
    visual:   (
      <div className="w-full space-y-4 py-4">
        {[
          { label: "Da'an", sub: 'Young professionals', pct: 88, color: '#f97316' },
          { label: 'Neihu', sub: 'Tech industry',       pct: 76, color: '#3b82f6' },
          { label: 'Xinyi', sub: 'Luxury / white collar', pct: 82, color: '#a855f7' },
          { label: 'Wanhua', sub: 'Traditional market',  pct: 52, color: '#22c55e' },
        ].map(d => (
          <div key={d.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-gray-700">{d.label}</span>
              <span className="text-gray-400">{d.sub}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${d.pct}%`, backgroundColor: d.color }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id:       'timemachine',
    eyebrow:  'Bonus — Historical context',
    headline: 'Watch the city\ngrow over time.',
    sub:      'The Time Machine shows when every store opened — and which ones closed.',
    detail:   'Blue = established, saturated zone. Red = recent growth. Skull markers flag dead zones where businesses repeatedly fail. Use it before the consulting map to understand the market\'s history.',
    dark:     true,
    visual:   <TimeVisual />,
    cta:      { label: 'Open Time Machine', href: '/time-machine' },
  },
  {
    id:       'growth',
    eyebrow:  'The bigger picture',
    headline: 'Taipei\'s business\nlandscape, decoded.',
    sub:      'Trend lines, not snapshots.',
    detail:   'Rising bars mean the category is growing in that district. Flat or shrinking bars signal saturation. Use trend data alongside social signals to time your entry right.',
    dark:     false,
    visual:   <TrendChart dark={false} />,
    cta:      { label: 'Start Consulting Analysis', href: '/consulting' },
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────
export default function IntroPage() {
  return (
    <>
      <Head>
        <title>How It Works — Taipei Business Map</title>
        <meta name="description" content="Location intelligence for business owners in Taipei. Social signals, demographics, competitor density." />
      </Head>

      {/* Minimal floating nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4
        bg-black/60 backdrop-blur-md border-b border-white/5">
        <Link href="/" className="text-white font-bold text-sm tracking-tight">
          Taipei Business Map
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm transition">Map</Link>
          <Link href="/time-machine" className="text-gray-400 hover:text-white text-sm transition">Time Machine</Link>
          <Link
            href="/consulting"
            className="bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-orange-600 transition"
          >
            Consulting
          </Link>
        </div>
      </nav>

      <main>
        <Hero />

        <div id="how-it-works">
          {SECTIONS.map((s, i) => <Section key={s.id} s={s} index={i} />)}
        </div>

        <StatsBar />
        <FinalCTA />
      </main>

      {/* Footer */}
      <footer className="bg-black border-t border-white/5 py-10 text-center">
        <p className="text-gray-600 text-xs">
          Taipei Business Map · Built for location intelligence
        </p>
        <div className="flex justify-center gap-6 mt-4">
          {[['Map', '/'], ['Time Machine', '/time-machine'], ['Consulting', '/consulting'], ['About', '/about']].map(([label, href]) => (
            <Link key={href} href={href} className="text-gray-600 hover:text-gray-300 text-xs transition">
              {label}
            </Link>
          ))}
        </div>
      </footer>
    </>
  )
}
