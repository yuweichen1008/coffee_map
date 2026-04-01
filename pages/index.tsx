import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Head from 'next/head'

// ── Scroll-reveal hook ────────────────────────────────────────────────────────
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect() }
    }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return { ref, visible }
}

// ── Animated number ───────────────────────────────────────────────────────────
function Num({ to, suffix = '', dur = 1400 }: { to: number; suffix?: string; dur?: number }) {
  const [val, setVal] = useState(0)
  const spanRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      let t0: number | null = null
      const tick = (ts: number) => {
        if (!t0) t0 = ts
        const p = Math.min((ts - t0) / dur, 1)
        const ease = 1 - Math.pow(1 - p, 3)
        setVal(Math.round(ease * to))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    if (spanRef.current) io.observe(spanRef.current)
    return () => io.disconnect()
  }, [to, dur])
  return <span ref={spanRef}>{val.toLocaleString()}{suffix}</span>
}

// ── Pill badge ────────────────────────────────────────────────────────────────
function Pill({ children, color = '#f97316' }: { children: string; color?: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: `${color}22`, color }}>
      {children}
    </span>
  )
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({
  icon, title, desc, href, label, delay = 0
}: { icon: string; title: string; desc: string; href: string; label: string; delay?: number }) {
  const { ref, visible } = useReveal()
  return (
    <div
      ref={ref}
      className="group relative bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/8 hover:border-orange-500/30 transition-all duration-500 cursor-pointer"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      <div className="text-3xl">{icon}</div>
      <div>
        <h3 className="text-white font-bold text-lg mb-1.5 leading-snug">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
      </div>
      <Link
        href={href}
        className="mt-auto inline-flex items-center gap-1.5 text-orange-400 text-sm font-semibold group-hover:text-orange-300 transition-colors"
      >
        {label}
        <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}

// ── Daan insight card ─────────────────────────────────────────────────────────
function InsightCard({ rank, title, value, sub, color, delay }: {
  rank: string; title: string; value: string; sub: string; color: string; delay: number
}) {
  const { ref, visible } = useReveal()
  return (
    <div
      ref={ref}
      className="bg-white/5 border border-white/8 rounded-xl p-5 flex flex-col gap-2"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color }}>{rank}</div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-sm font-semibold text-gray-300">{title}</div>
      <div className="text-xs text-gray-500 leading-relaxed">{sub}</div>
    </div>
  )
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function Landing() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const heroReveal    = useReveal(0)
  const statsReveal   = useReveal()
  const daanReveal    = useReveal()
  const platformReveal= useReveal()
  const ctaReveal     = useReveal()

  return (
    <>
      <Head>
        <title>StorePulse — Business Location Intelligence for Taipei</title>
        <meta name="description"
          content="B2B platform for business owners. Social signal analysis, competitor density, and demographic data across every Taipei district." />
      </Head>

      {/* ── Floating nav ──────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-black/80 backdrop-blur-xl border-b border-white/8' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <span className="text-white font-bold text-sm tracking-tight">StorePulse</span>
            <span className="text-gray-600 text-xs">for Taipei</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/map" className="text-gray-400 hover:text-white text-sm transition">Map</Link>
            <Link href="/consulting" className="text-gray-400 hover:text-white text-sm transition">Consulting</Link>
            <Link href="/time-machine" className="text-gray-400 hover:text-white text-sm transition">Time Machine</Link>
            <Link href="/intro" className="text-gray-400 hover:text-white text-sm transition">How It Works</Link>
          </div>
          <Link href="/consulting"
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all active:scale-95">
            Start Analysis
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="min-h-screen bg-black flex flex-col items-center justify-center text-center px-6 pt-20 pb-10 relative overflow-hidden">

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(249,115,22,0.10) 0%, rgba(239,68,68,0.04) 40%, transparent 70%)' }} />
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }} />
        </div>

        <div
          ref={heroReveal.ref}
          className="relative z-10 max-w-4xl transition-all duration-1000"
          style={{ opacity: heroReveal.visible ? 1 : 0, transform: heroReveal.visible ? 'translateY(0)' : 'translateY(32px)' }}
        >
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-orange-300 text-xs font-semibold tracking-wider uppercase">B2B Location Intelligence Platform</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] text-white mb-6">
            Don&apos;t guess<br />
            where to open.<br />
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%)' }}>
              Know.
            </span>
          </h1>

          <p className="text-xl text-gray-400 font-light max-w-2xl mx-auto leading-relaxed mb-10">
            StorePulse gives business owners the same data-driven edge that franchise chains have had for decades —
            social momentum, competitor density, foot traffic demographics — for every district in Taipei.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
            <Link href="/consulting"
              className="px-8 py-4 bg-orange-500 text-white rounded-full font-bold text-base hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/20">
              Analyse Da&apos;an District
            </Link>
            <Link href="/intro"
              className="px-8 py-4 bg-white/8 text-white rounded-full font-semibold text-base border border-white/10 hover:bg-white/12 active:scale-95 transition-all">
              See how it works
            </Link>
          </div>

          {/* Social proof logos (placeholder trust marks) */}
          <div className="flex items-center justify-center gap-8 opacity-30">
            {['Supabase', 'Google Maps', 'Mapbox', 'PostGIS'].map(name => (
              <span key={name} className="text-gray-400 text-xs font-semibold tracking-wide uppercase">{name}</span>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div className={`absolute bottom-8 flex flex-col items-center gap-2 transition-opacity duration-500 ${scrolled ? 'opacity-0' : 'opacity-50'}`}>
          <div className="w-px h-10 bg-gradient-to-b from-white/40 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────────── */}
      <section className="bg-black border-y border-white/8 py-14">
        <div
          ref={statsReveal.ref}
          className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 px-6 transition-all duration-700"
          style={{ opacity: statsReveal.visible ? 1 : 0, transform: statsReveal.visible ? 'translateY(0)' : 'translateY(20px)' }}
        >
          {[
            { n: 4964, suf: '+', label: 'Active businesses tracked', color: '#f97316' },
            { n: 12,   suf: '',  label: 'Taipei districts covered',  color: '#3b82f6' },
            { n: 5,    suf: '',  label: 'Social platforms analysed', color: '#a855f7' },
            { n: 1263, suf: '+', label: 'Cafes in the Da\'an alone',  color: '#ec4899' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-3xl md:text-4xl font-black tabular-nums" style={{ color: s.color }}>
                <Num to={s.n} suffix={s.suf} />
              </div>
              <div className="text-gray-500 text-xs mt-1.5 leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Da'an District Spotlight ───────────────────────────────────────────── */}
      <section className="bg-black py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div
            ref={daanReveal.ref}
            className="transition-all duration-700"
            style={{ opacity: daanReveal.visible ? 1 : 0, transform: daanReveal.visible ? 'translateY(0)' : 'translateY(24px)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Pill color="#f97316">Case study</Pill>
              <Pill color="#3b82f6">Da&apos;an District · 大安區</Pill>
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4">
              Taipei&apos;s most competitive<br />
              café market — decoded.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl leading-relaxed mb-12">
              1,200+ cafes. 318,000 residents. NTU student population of 33,000.
              Da&apos;an is the ultimate stress test for any food &amp; beverage concept —
              and the highest-reward district when you find the right pocket.
            </p>
          </div>

          {/* Insight cards grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { rank: 'Population', value: '318K', title: 'District residents', sub: '70% aged 15–64, disposable income above city avg.', color: '#f97316', delay: 0 },
              { rank: 'Density',    value: '#1', title: 'Café density in Taipei', sub: 'Highest concentration of specialty & independent cafes.', color: '#ef4444', delay: 80 },
              { rank: 'Social',     value: '87%', title: 'Instagram discovery rate', sub: 'Most café visits in Da\'an are driven by IG or Google Maps discovery.', color: '#E1306C', delay: 160 },
              { rank: 'Student mkt', value: '33K', title: 'NTU students nearby', sub: 'Daily foot traffic between Gongguan and Shida night market.', color: '#a855f7', delay: 240 },
              { rank: 'Timing',     value: '2020–', title: 'Specialty wave', sub: '3rd-wave coffee boom since 2020: single-origin, pour-over, small-batch roasters.', color: '#3b82f6', delay: 320 },
              { rank: 'Risk',       value: '18%', title: 'Annual closure rate', sub: 'High competition — zone selection matters. Dead zones cluster near Shida Rd south end.', color: '#f59e0b', delay: 400 },
              { rank: 'Avg ticket', value: 'NT$150', title: 'Per order — cafes', sub: 'Specialty commands 1.8× premium vs chain. Customers repeat 3×/week avg.', color: '#22c55e', delay: 480 },
              { rank: 'Opportunity', value: '↑ Boba', title: 'Growth gap identified', sub: 'Boba & premium beverage under-represented vs café count. Emerging sub-market.', color: '#06b6d4', delay: 560 },
            ].map(c => <InsightCard key={c.title} {...c} />)}
          </div>

          <div className="mt-10 flex gap-4">
            <Link href="/consulting"
              className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-orange-600 active:scale-95 transition-all">
              Analyse Da&apos;an now
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/time-machine"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white px-6 py-3 rounded-full text-sm font-semibold border border-white/10 hover:border-white/20 transition-all">
              See market history
            </Link>
          </div>
        </div>
      </section>

      {/* ── Platform signals ───────────────────────────────────────────────────── */}
      <section className="bg-[#080808] py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div
            ref={platformReveal.ref}
            className="transition-all duration-700"
            style={{ opacity: platformReveal.visible ? 1 : 0, transform: platformReveal.visible ? 'translateY(0)' : 'translateY(24px)' }}
          >
            <Pill color="#a855f7">Social intelligence</Pill>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mt-4 mb-4">
              Where your customers<br />discover you — before they walk in.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl leading-relaxed mb-14">
              Every trending store in Da&apos;an shows up as a signal bubble on the map — sized by score,
              coloured by platform. Filter by channel, set a minimum trend score, and immediately see
              which neighbourhoods have social momentum.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-3">
            {[
              { emoji: '📸', platform: 'Instagram',  color: '#E1306C', score: 87, insight: 'Visual discovery. Specialty cafes, latte art, interior aesthetics. Highest share-of-voice in Da\'an.' },
              { emoji: '🎵', platform: 'TikTok',     color: '#69C9D0', score: 72, insight: 'Viral moments. Boba chains, unique drinks, "must-try" lists. Fastest-growing channel 2023–2024.' },
              { emoji: '👥', platform: 'Facebook',   color: '#1877F2', score: 61, insight: 'Group recommendations. Event posts, loyalty communities. Dominant for restaurants and chain cafes.' },
              { emoji: '🧵', platform: 'Threads',    color: '#a78bfa', score: 54, insight: 'Emerging. Indie cafes & third-wave roasters building early-adopter audiences.' },
              { emoji: '💬', platform: 'LINE',       color: '#00B900', score: 48, insight: 'Word of mouth. Group chat referrals for restaurants and delivery. Strong afternoon-tea segment.' },
            ].map((p, i) => (
              <div key={p.platform}
                className="bg-white/4 border border-white/8 rounded-xl p-5 flex flex-col gap-3 hover:border-white/15 transition-all"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="text-lg font-black tabular-nums" style={{ color: p.color }}>{p.score}</span>
                </div>
                <div className="font-bold text-white text-sm">{p.platform}</div>
                <p className="text-gray-500 text-xs leading-relaxed">{p.insight}</p>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden mt-auto">
                  <div className="h-full rounded-full" style={{ width: `${p.score}%`, backgroundColor: p.color, opacity: 0.8 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tool suite ────────────────────────────────────────────────────────── */}
      <section className="bg-black py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="mb-14">
            <Pill color="#22c55e">What&apos;s inside</Pill>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mt-4 mb-3">
              Three tools.<br />One decision.
            </h2>
            <p className="text-gray-400 text-lg max-w-xl">
              Every feature is built around a single question: <em className="text-gray-300">should you open here?</em>
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard
              delay={0}
              icon="📍"
              title="Business Map"
              desc="Live competitor density across all 12 Taipei districts. Heatmap at city scale, individual pins at street level. Streaming data — first pins appear in under a second."
              href="/map"
              label="Open map"
            />
            <FeatureCard
              delay={120}
              icon="📊"
              title="Consulting Dashboard"
              desc="Social signal bubbles, Location Score (0–100), demographic breakdown, and a top-10 trending list — all for one district, in one screen."
              href="/consulting"
              label="Run analysis"
            />
            <FeatureCard
              delay={240}
              icon="⏱"
              title="Time Machine"
              desc="Every store that ever opened — and every one that closed. Cold-to-warm colour coding shows established zones vs. recent growth. Dead zones warn you off failure clusters."
              href="/time-machine"
              label="Explore history"
            />
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────────── */}
      <section className="bg-black py-28 px-6 border-t border-white/5">
        <div
          ref={ctaReveal.ref}
          className="max-w-2xl mx-auto text-center transition-all duration-700"
          style={{ opacity: ctaReveal.visible ? 1 : 0, transform: ctaReveal.visible ? 'translateY(0)' : 'translateY(24px)' }}
        >
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-5">
            Your next location<br />is already on the map.
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Start with Da&apos;an — Taipei&apos;s highest-signal district — and see the opportunity gaps that
            competitor chains won&apos;t show you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/consulting"
              className="px-10 py-4 bg-orange-500 text-white rounded-full font-bold text-lg hover:bg-orange-600 active:scale-95 transition-all shadow-xl shadow-orange-500/20">
              Analyse Da&apos;an — free
            </Link>
            <Link href="/intro"
              className="px-10 py-4 text-white rounded-full font-semibold text-lg border border-white/15 hover:bg-white/5 active:scale-95 transition-all">
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer className="bg-black border-t border-white/6 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <span className="text-gray-400 text-sm font-semibold">StorePulse · Taipei</span>
          </div>
          <div className="flex items-center gap-6">
            {[['Map', '/map'], ['Consulting', '/consulting'], ['Time Machine', '/time-machine'], ['How It Works', '/intro']].map(([l, h]) => (
              <Link key={h} href={h} className="text-gray-600 hover:text-gray-300 text-xs transition">{l}</Link>
            ))}
          </div>
          <p className="text-gray-700 text-xs">B2B Location Intelligence Platform</p>
        </div>
      </footer>
    </>
  )
}
