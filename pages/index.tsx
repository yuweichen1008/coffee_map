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

  const heroReveal     = useReveal(0)
  const statsReveal    = useReveal()
  const spotlightReveal= useReveal()
  const signalReveal   = useReveal()
  const toolReveal     = useReveal()
  const ctaReveal      = useReveal()

  return (
    <>
      <Head>
        <title>StorePulse — Retail Location Intelligence for Singapore</title>
        <meta name="description"
          content="The only location intelligence platform in Singapore that maps store closures as a risk signal. Know where to open before you sign the lease." />
      </Head>

      {/* ── Floating nav ──────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-black/85 backdrop-blur-xl border-b border-white/8' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <span className="text-white font-bold text-sm tracking-tight">StorePulse</span>
            <span className="hidden sm:block text-gray-600 text-xs">· Singapore</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/map"          className="text-gray-400 hover:text-white text-sm transition">Map</Link>
            <Link href="/time-machine" className="text-gray-400 hover:text-white text-sm transition">Time Machine</Link>
            <Link href="/intro"        className="text-gray-400 hover:text-white text-sm transition">How It Works</Link>
            <Link href="/pitch"        className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 text-sm font-semibold transition">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              Investor Deck
            </Link>
          </div>
          <Link href="/map"
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all active:scale-95">
            Open Map
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="min-h-screen bg-black flex flex-col items-center justify-center text-center px-6 pt-20 pb-10 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(249,115,22,0.10) 0%, rgba(239,68,68,0.04) 40%, transparent 70%)' }} />
          <div className="absolute inset-0 opacity-[0.14]"
            style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
        </div>

        <div ref={heroReveal.ref} className="relative z-10 max-w-4xl"
          style={{ opacity: heroReveal.visible ? 1 : 0, transform: heroReveal.visible ? 'translateY(0)' : 'translateY(32px)', transition: 'opacity 1s ease, transform 1s ease' }}>

          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-orange-300 text-xs font-semibold tracking-wider uppercase">Singapore · Live Data · 19 Districts</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] text-white mb-6">
            The right location<br />
            in Singapore<br />
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%)' }}>
              isn&apos;t luck.
            </span>
          </h1>

          <p className="text-xl text-gray-400 font-light max-w-2xl mx-auto leading-relaxed mb-10">
            60% of Singapore F&amp;B businesses fail in Year 1. Bad location is the #1 cause.
            StorePulse maps competitor density, closure risk, and neighbourhood signals
            across every planning area — so you know before you sign.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
            <Link href="/map"
              className="px-8 py-4 bg-orange-500 text-white rounded-full font-bold text-base hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/20">
              Explore Singapore Map
            </Link>
            <Link href="/pitch"
              className="px-8 py-4 bg-white/8 text-white rounded-full font-semibold text-base border border-white/10 hover:bg-white/12 active:scale-95 transition-all">
              Investor Overview
            </Link>
          </div>

          <div className="flex items-center justify-center gap-8 opacity-25">
            {['Google Places API', 'PostGIS · Supabase', 'Mapbox GL', 'data.gov.sg'].map(name => (
              <span key={name} className="text-gray-400 text-[11px] font-semibold tracking-wide uppercase">{name}</span>
            ))}
          </div>
        </div>

        <div className={`absolute bottom-8 flex flex-col items-center gap-2 transition-opacity duration-500 ${scrolled ? 'opacity-0' : 'opacity-40'}`}>
          <div className="w-px h-10 bg-gradient-to-b from-white/40 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────────── */}
      <section className="bg-black border-y border-white/8 py-14">
        <div ref={statsReveal.ref}
          className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 px-6"
          style={{ opacity: statsReveal.visible ? 1 : 0, transform: statsReveal.visible ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
          {[
            { n: 5900000, suf: '+', label: 'Singapore residents in catchment', color: '#f97316' },
            { n: 19,      suf: '',  label: 'Planning areas fully mapped',      color: '#3b82f6' },
            { n: 13,      suf: '',  label: 'Store signal categories tracked',  color: '#a855f7' },
            { n: 60,      suf: '%', label: 'F&B businesses fail in Year 1',    color: '#ef4444' },
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

      {/* ── Singapore Spotlight ───────────────────────────────────────────────── */}
      <section className="bg-black py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div ref={spotlightReveal.ref}
            style={{ opacity: spotlightReveal.visible ? 1 : 0, transform: spotlightReveal.visible ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
            <div className="flex items-center gap-3 mb-4">
              <Pill color="#f97316">Singapore case study</Pill>
              <Pill color="#3b82f6">Orchard · Tanjong Pagar Corridor</Pill>
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4">
              Singapore&apos;s most competitive<br />
              retail corridor — decoded.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl leading-relaxed mb-12">
              Orchard Road draws 25M+ visitors a year, yet vacancy rates have climbed post-COVID.
              Three MRT stops south, Tanjong Pagar&apos;s boutique corridor is outperforming every index.
              StorePulse shows you exactly why — and where the next window opens.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { rank: 'Market size',  value: '40K+',   title: 'F&B establishments in SG',  sub: '8,000–10,000 new business licences issued every year.',              color: '#f97316', delay: 0   },
              { rank: 'Failure rate', value: '60%',    title: 'Fail within Year 1',         sub: 'IE Singapore / MOM data. Bad location is the primary cause.',        color: '#ef4444', delay: 80  },
              { rank: 'Discovery',    value: '92%',    title: 'Check Google Maps first',    sub: 'Diners in Singapore verify location via Google Maps before visiting.', color: '#3b82f6', delay: 160 },
              { rank: 'MRT signal',   value: '130+',   title: 'MRT stations = catchments',  sub: 'Every exit has a 500m radius of captive daily foot traffic.',          color: '#a855f7', delay: 240 },
              { rank: 'Dead zone',    value: '↓ Orchard North', title: 'High closure cluster',sub: 'Post-COVID dead zone forming between Somerset and Orchard MRT.',  color: '#f59e0b', delay: 320 },
              { rank: 'Opportunity',  value: '↑ Keong Saik', title: 'Boutique corridor surge', sub: 'Tanjong Pagar sub-district: café + coworking + lifestyle opening wave 2023–25.', color: '#22c55e', delay: 400 },
              { rank: 'HDB signal',   value: '1.1M',   title: 'HDB flats = supply gaps',   sub: 'New BTO estates (Tengah, Punggol) lack F&B for 3–5 years post-launch.', color: '#06b6d4', delay: 480 },
              { rank: 'Avg rent',     value: 'SGD 12', title: 'psf/mo CBD retail range',   sub: 'Vs SGD 6–8 in Novena/Toa Payoh with comparable daytime foot traffic.',  color: '#ec4899', delay: 560 },
            ].map(c => <InsightCard key={c.title} {...c} />)}
          </div>

          <div className="mt-10 flex gap-4">
            <Link href="/map"
              className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-orange-600 active:scale-95 transition-all">
              See Tanjong Pagar on the map
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/time-machine"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white px-6 py-3 rounded-full text-sm font-semibold border border-white/10 hover:border-white/20 transition-all">
              View closure history
            </Link>
          </div>
        </div>
      </section>

      {/* ── Discovery channels ────────────────────────────────────────────────── */}
      <section className="bg-[#080808] py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div ref={signalReveal.ref}
            style={{ opacity: signalReveal.visible ? 1 : 0, transform: signalReveal.visible ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
            <Pill color="#a855f7">Singapore discovery channels</Pill>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mt-4 mb-4">
              Where Singapore diners<br />find you — ranked by signal.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl leading-relaxed mb-14">
              Each platform drives a different customer intent. StorePulse scores venues across all five
              channels so you can benchmark social momentum before you sign the lease.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-3">
            {[
              { emoji: '⭐', platform: 'Google Maps', color: '#4285F4', score: 92, insight: '#1 discovery channel in SG. 92% of diners verify on Google Maps. Rating ≥ 4.2 is table stakes for consideration.' },
              { emoji: '📸', platform: 'Instagram',   color: '#E1306C', score: 78, insight: 'Visual credibility. Cafes, aesthetics, latte art. CBD and Orchard lifestyle venues see highest IG share-of-voice.' },
              { emoji: '🎵', platform: 'TikTok',      color: '#69C9D0', score: 71, insight: 'Viral food content. Queue-worthy items, hidden gems, "worth it?" reviews. Youth-driven, fastest-growing reach.' },
              { emoji: '🚗', platform: 'Grab',        color: '#00B14F', score: 65, insight: 'Delivery + dine-in discovery. Dominant food delivery app in SG. Top-ranked venues get 3× organic order volume.' },
              { emoji: '💬', platform: 'WhatsApp',    color: '#25D366', score: 54, insight: 'Group chat word-of-mouth. High-trust peer recommendations for family restaurants and weekend brunch spots.' },
            ].map((p, i) => (
              <div key={p.platform}
                className="bg-white/4 border border-white/8 rounded-xl p-5 flex flex-col gap-3 hover:border-white/15 transition-all"
                style={{ animationDelay: `${i * 80}ms` }}>
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
          <div ref={toolReveal.ref} className="mb-14"
            style={{ opacity: toolReveal.visible ? 1 : 0, transform: toolReveal.visible ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
            <Pill color="#22c55e">Three tools</Pill>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mt-4 mb-3">
              One question answered:<br />
              <em className="text-gray-400 not-italic">should you open here?</em>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard delay={0}   icon="📍" title="Intelligence Map"
              desc="Faded heatmap across all 19 Singapore planning areas. Switch between 13 store categories. Each category shows the demographic signal it represents — not just dots on a map."
              href="/map" label="Open map" />
            <FeatureCard delay={120} icon="⏱"  title="Time Machine"
              desc="Every store that ever opened — and every one that closed. Cold-to-warm gradient shows established vs. growing zones. Dead zone clusters warn you off structurally challenged areas."
              href="/time-machine" label="Explore history" />
            <FeatureCard delay={240} icon="📋"  title="Location Report"
              desc="A full consulting report for your target address: 13 signal scores, competitor map, dead zone risk assessment, Time Machine trend, and a clear open/avoid verdict."
              href="/pitch" label="See the format" />
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────────── */}
      <section className="bg-black py-28 px-6 border-t border-white/5">
        <div ref={ctaReveal.ref}
          className="max-w-2xl mx-auto text-center"
          style={{ opacity: ctaReveal.visible ? 1 : 0, transform: ctaReveal.visible ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-5">
            Your next Singapore location<br />is already on the map.
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
            See which neighbourhoods are growing, which are contracting, and where the
            next window opens — before your competitors do.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/map"
              className="px-10 py-4 bg-orange-500 text-white rounded-full font-bold text-lg hover:bg-orange-600 active:scale-95 transition-all shadow-xl shadow-orange-500/20">
              Explore Singapore
            </Link>
            <Link href="/pitch"
              className="px-10 py-4 text-white rounded-full font-semibold text-lg border border-white/15 hover:bg-white/5 active:scale-95 transition-all">
              Investor overview
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
            <span className="text-gray-400 text-sm font-semibold">StorePulse · Singapore</span>
          </div>
          <div className="flex items-center gap-6">
            {([['Map', '/map'], ['Time Machine', '/time-machine'], ['How It Works', '/intro'], ['Investor Deck', '/pitch']] as [string,string][]).map(([l, h]) => (
              <Link key={h} href={h} className="text-gray-600 hover:text-gray-300 text-xs transition">{l}</Link>
            ))}
          </div>
          <p className="text-gray-700 text-xs">Retail Location Intelligence for Southeast Asia</p>
        </div>
      </footer>
    </>
  )
}
