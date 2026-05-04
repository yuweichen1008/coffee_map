import { FC, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Navbar from '../components/Navbar'

// ── MRT Station constants ─────────────────────────────────────────────────────
type MRTStation = { name: string; lat: number; lng: number; line: string }

const MRT_STATIONS: MRTStation[] = [
  { name: 'Orchard',        lat: 1.3040,  lng: 103.8318, line: 'NSL' },
  { name: 'Raffles Place',  lat: 1.2840,  lng: 103.8514, line: 'EWL / NSL' },
  { name: 'City Hall',      lat: 1.2931,  lng: 103.8520, line: 'EWL / NSL' },
  { name: 'Dhoby Ghaut',    lat: 1.2990,  lng: 103.8457, line: 'NSL / CCL' },
  { name: 'Tanjong Pagar',  lat: 1.2763,  lng: 103.8461, line: 'EWL' },
  { name: 'Bugis',          lat: 1.3006,  lng: 103.8559, line: 'EWL / DTL' },
  { name: 'Novena',         lat: 1.3203,  lng: 103.8437, line: 'NSL' },
  { name: 'Bishan',         lat: 1.3510,  lng: 103.8480, line: 'NSL / CCL' },
  { name: 'Ang Mo Kio',     lat: 1.3700,  lng: 103.8496, line: 'NSL' },
  { name: 'Yishun',         lat: 1.4291,  lng: 103.8354, line: 'NSL' },
  { name: 'Woodlands',      lat: 1.4371,  lng: 103.7861, line: 'NSL' },
  { name: 'Jurong East',    lat: 1.3330,  lng: 103.7436, line: 'EWL / NSL' },
  { name: 'Tampines',       lat: 1.3529,  lng: 103.9451, line: 'EWL' },
  { name: 'Paya Lebar',     lat: 1.3175,  lng: 103.8925, line: 'EWL / CCL' },
  { name: 'Serangoon',      lat: 1.3501,  lng: 103.8729, line: 'NEL / CCL' },
  { name: 'Harbourfront',   lat: 1.2651,  lng: 103.8215, line: 'NEL / CCL' },
  { name: 'Sengkang',       lat: 1.3915,  lng: 103.8950, line: 'NEL / LRT' },
  { name: 'Punggol',        lat: 1.4053,  lng: 103.9022, line: 'NEL / LRT' },
  { name: 'Bedok',          lat: 1.3240,  lng: 103.9300, line: 'EWL' },
  { name: 'Clementi',       lat: 1.3152,  lng: 103.7649, line: 'EWL' },
  { name: 'Boon Lay',       lat: 1.3388,  lng: 103.7059, line: 'EWL' },
  { name: 'Bayfront',       lat: 1.2822,  lng: 103.8595, line: 'CCL / DTL' },
  { name: 'Queenstown',     lat: 1.2941,  lng: 103.8058, line: 'EWL' },
  { name: 'Toa Payoh',      lat: 1.3327,  lng: 103.8468, line: 'NSL' },
  { name: 'Changi Airport', lat: 1.3592,  lng: 103.9887, line: 'EWL' },
]

const JURONG_EAST_MRT = MRT_STATIONS.find(s => s.name === 'Jurong East')!

const SG_DISTRICTS = [
  'all', 'Orchard', 'Marina_Bay', 'Tanjong_Pagar', 'Chinatown', 'Bugis',
  'Novena', 'Queenstown', 'Toa_Payoh', 'Bishan', 'Tampines', 'Jurong_East',
  'Woodlands', 'Sengkang', 'Punggol', 'Ang_Mo_Kio', 'Bedok', 'Clementi',
  'Yishun', 'Serangoon',
]

// ── Types ─────────────────────────────────────────────────────────────────────
type HawkerResult = {
  id: string
  name: string
  address: string | null
  district: string | null
  rating: number | null
  review_count: number | null
  lat: number
  lng: number
  nea_grade: 'A' | 'B' | 'C' | null
  nea_inspected: string | null
}

type MallResult = HawkerResult & { distance_m: number }

// ── Consulting insight generator ──────────────────────────────────────────────
function mallInsight(malls: MallResult[], radius: number): { label: string; color: string } {
  const close = malls.filter(m => m.distance_m <= Math.min(radius, 800)).length
  if (close >= 3) return { label: 'Premium retail corridor — high foot traffic, expect premium rents and weekend peaks', color: '#f59e0b' }
  if (close >= 1) return { label: 'Mid-tier catchment — balanced rent-to-footfall ratio, suits established brands', color: '#0ea5e9' }
  return { label: 'Emerging zone — low mall competition, early-mover advantage before rents spike', color: '#22c55e' }
}

// ── Medal badge ───────────────────────────────────────────────────────────────
function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-base">🥇</span>
  if (rank === 2) return <span className="text-base">🥈</span>
  if (rank === 3) return <span className="text-base">🥉</span>
  return <span className="text-xs font-bold text-gray-400 w-5 text-right tabular-nums">#{rank}</span>
}

// ── NEA hygiene grade badge ───────────────────────────────────────────────────
const NEA_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-green-900/60',  text: 'text-green-400',  label: 'A Grade' },
  B: { bg: 'bg-yellow-900/60', text: 'text-yellow-400', label: 'B Grade' },
  C: { bg: 'bg-red-900/60',    text: 'text-red-400',    label: 'C Grade' },
}
function NeaGrade({ grade, inspected }: { grade: string | null; inspected?: string | null }) {
  if (!grade || !NEA_COLORS[grade]) return null
  const { bg, text, label } = NEA_COLORS[grade]
  return (
    <span
      title={`NEA Hygiene: ${label}${inspected ? ` · Inspected ${inspected}` : ''}`}
      className={`text-xs font-bold px-1.5 py-0.5 rounded ${bg} ${text} shrink-0`}
    >
      {label}
    </span>
  )
}

// ── Star rating display ───────────────────────────────────────────────────────
function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-gray-500 text-xs">No rating</span>
  return (
    <span className="text-yellow-400 text-xs font-semibold">
      ★ {rating.toFixed(1)}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const DiscoverPage: FC = () => {
  const [tab, setTab] = useState<'hawker' | 'malls' | 'jurong'>('hawker')
  const [district, setDistrict] = useState('all')
  const [selectedMRT, setSelectedMRT] = useState<MRTStation>(MRT_STATIONS[0])
  const [radius, setRadius] = useState(1500)
  const [hawkers, setHawkers]         = useState<HawkerResult[]>([])
  const [malls, setMalls]             = useState<MallResult[]>([])
  const [jurongHawkers, setJurongHawkers] = useState<HawkerResult[]>([])
  const [jurongMalls,   setJurongMalls]   = useState<MallResult[]>([])
  const [loading, setLoading]         = useState(false)
  const [jurongLoading, setJurongLoading] = useState(false)
  const [hawkersLoaded, setHawkersLoaded] = useState(false)

  // ── Picker state ──────────────────────────────────────────────────────────
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)
  const pickedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Fetch hawkers ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'jurong') return
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (district !== 'all') params.set('district', district)
    fetch(`/api/hawker-rank?${params}`)
      .then(r => r.json())
      .then(j => { setHawkers(j.results ?? []); setHawkersLoaded(true) })
      .catch(() => setHawkersLoaded(true))
      .finally(() => setLoading(false))
  }, [district, tab])

  // ── Fetch malls ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'malls') return
    setLoading(true)
    const params = new URLSearchParams({
      lat: String(selectedMRT.lat),
      lng: String(selectedMRT.lng),
      radius: String(radius),
    })
    fetch(`/api/mrt-malls?${params}`)
      .then(r => r.json())
      .then(j => setMalls(j.results ?? []))
      .catch(() => setMalls([]))
      .finally(() => setLoading(false))
  }, [tab, selectedMRT, radius])

  // ── Fetch Jurong East (hawkers + malls in parallel) ───────────────────────
  useEffect(() => {
    if (tab !== 'jurong') return
    setJurongLoading(true)
    const hawkerParams = new URLSearchParams({ limit: '20', district: 'Jurong_East' })
    const mallParams   = new URLSearchParams({
      lat: String(JURONG_EAST_MRT.lat),
      lng: String(JURONG_EAST_MRT.lng),
      radius: '1500',
    })
    Promise.all([
      fetch(`/api/hawker-rank?${hawkerParams}`).then(r => r.json()),
      fetch(`/api/mrt-malls?${mallParams}`).then(r => r.json()),
    ])
      .then(([hj, mj]) => {
        setJurongHawkers(hj.results ?? [])
        setJurongMalls(mj.results ?? [])
      })
      .catch(() => {})
      .finally(() => setJurongLoading(false))
  }, [tab])

  // ── Picker helpers ─────────────────────────────────────────────────────────
  const pickRandom = (list: Array<{ id: string }>) => {
    if (list.length === 0) return
    if (pickedTimer.current) clearTimeout(pickedTimer.current)
    const picked = list[Math.floor(Math.random() * list.length)]
    setPickedId(picked.id)
    setTimeout(() => rowRefs.current[picked.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    pickedTimer.current = setTimeout(() => setPickedId(null), 3000)
  }

  const copyPrompt = (list: HawkerResult[], context: string) => {
    const lines = list.slice(0, 15).map((h, i) => {
      const grade = h.nea_grade ? ` [NEA ${h.nea_grade}]` : ''
      const votes = h.review_count ? ` (${h.review_count.toLocaleString()} reviews)` : ''
      return `${i + 1}. ${h.name}${h.district ? ' – ' + h.district.replace(/_/g, ' ') : ''}${h.rating ? ' – ★' + h.rating.toFixed(1) : ''}${votes}${grade}`
    }).join('\n')

    const prompt = `You are a Singapore food advisor. Here are the top hawker centres ${context} by popularity:\n\n${lines}\n\nWhich one should I visit and why? Give a single confident recommendation with brief reasoning.`
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const insight = mallInsight(malls, radius)

  // ── Shared hawker row renderer ─────────────────────────────────────────────
  const HawkerRow = ({ h, rank }: { h: HawkerResult; rank: number }) => {
    const isPicked = pickedId === h.id
    return (
      <div
        key={h.id}
        ref={el => { rowRefs.current[h.id] = el }}
        className={`bg-gray-900 border rounded-xl px-4 py-3.5 flex items-center gap-4 transition-all duration-300 ${
          isPicked
            ? 'border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
            : 'border-white/8 hover:border-white/16'
        }`}
      >
        <div className="w-8 flex items-center justify-center shrink-0">
          <Medal rank={rank} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{h.name}</p>
          <p className="text-gray-400 text-xs truncate mt-0.5">
            {h.district ? h.district.replace(/_/g, ' ') : ''}
            {h.district && h.address ? ' · ' : ''}
            {h.address ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NeaGrade grade={h.nea_grade} inspected={h.nea_inspected} />
          <Stars rating={h.rating} />
          {h.review_count != null && (
            <span className="text-xs text-gray-400 tabular-nums">
              {h.review_count.toLocaleString()} votes
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Picker bar ────────────────────────────────────────────────────────────
  const PickerBar = ({ list, promptContext }: { list: HawkerResult[]; promptContext: string }) => (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={() => pickRandom(list)}
        disabled={list.length === 0}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 hover:bg-orange-500/30 transition disabled:opacity-40"
      >
        🎲 Surprise me
      </button>
      <button
        onClick={() => copyPrompt(list, promptContext)}
        disabled={list.length === 0}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition disabled:opacity-40"
      >
        {copied ? '✓ Copied' : '📋 Ask Claude'}
      </button>
    </div>
  )

  return (
    <>
      <Head>
        <title>Discover Singapore — StorePulse</title>
        <meta name="description" content="Hawker centre rankings and MRT mall finder for Singapore location intelligence." />
      </Head>

      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />

        {/* Header */}
        <div className="max-w-4xl mx-auto px-5 pt-10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-400 mb-2">Singapore Intelligence</p>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Discover</h1>
          <p className="text-gray-400 text-sm">
            Hawker centre rankings · Malls near any MRT · Jurong East focus
          </p>
        </div>

        {/* Tab switcher */}
        <div className="max-w-4xl mx-auto px-5 mb-6">
          <div className="flex gap-2 border-b border-white/8">
            <button
              onClick={() => setTab('hawker')}
              className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                tab === 'hawker'
                  ? 'border-orange-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              🍜 Hawker Rankings
            </button>
            <button
              onClick={() => setTab('malls')}
              className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                tab === 'malls'
                  ? 'border-orange-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              🏬 MRT & Malls
            </button>
            <button
              onClick={() => setTab('jurong')}
              className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                tab === 'jurong'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              🌆 Jurong East
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-5 pb-16">

          {/* ── Hawker Rankings tab ─────────────────────────────────────────── */}
          {tab === 'hawker' && (
            <div>
              {/* Controls */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-xs text-gray-400 shrink-0">Filter by district</label>
                <select
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  className="bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  {SG_DISTRICTS.map(d => (
                    <option key={d} value={d}>
                      {d === 'all' ? 'All Districts' : d.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {!loading && hawkers.length > 0 && (
                <PickerBar list={hawkers} promptContext={district === 'all' ? 'across Singapore' : `in ${district.replace(/_/g, ' ')}`} />
              )}

              {loading && (
                <div className="text-gray-500 text-sm py-8 text-center">Loading hawker centres…</div>
              )}

              {!loading && hawkersLoaded && hawkers.length === 0 && (
                <div className="bg-gray-900 border border-white/8 rounded-xl p-8 text-center">
                  <p className="text-gray-400 text-sm mb-2">No hawker centres found yet.</p>
                  <p className="text-gray-500 text-xs">
                    Seed data with:{' '}
                    <code className="bg-gray-800 px-2 py-0.5 rounded text-orange-300 text-xs">
                      python3 scripts/fetch/fetch_places.py --city singapore --category &quot;hawker centre&quot;
                    </code>
                  </p>
                </div>
              )}

              {!loading && hawkers.length > 0 && (
                <div className="space-y-2">
                  {hawkers.map((h, i) => <HawkerRow key={h.id} h={h} rank={i + 1} />)}
                </div>
              )}
            </div>
          )}

          {/* ── MRT & Malls tab ─────────────────────────────────────────────── */}
          {tab === 'malls' && (
            <div>
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 shrink-0">MRT Station</label>
                  <select
                    value={selectedMRT.name}
                    onChange={e => {
                      const st = MRT_STATIONS.find(s => s.name === e.target.value)
                      if (st) setSelectedMRT(st)
                    }}
                    className="bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {MRT_STATIONS.map(s => (
                      <option key={s.name} value={s.name}>
                        {s.name} ({s.line})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 shrink-0">Radius</label>
                  <select
                    value={radius}
                    onChange={e => setRadius(parseInt(e.target.value))}
                    className="bg-gray-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    <option value={500}>500 m</option>
                    <option value={1000}>1 km</option>
                    <option value={1500}>1.5 km</option>
                    <option value={2000}>2 km</option>
                    <option value={3000}>3 km</option>
                  </select>
                </div>
              </div>

              {/* Consulting insight */}
              {!loading && (
                <div
                  className="rounded-xl border px-4 py-3 mb-5 text-sm"
                  style={{ borderColor: `${insight.color}40`, background: `${insight.color}12` }}
                >
                  <span className="font-semibold" style={{ color: insight.color }}>
                    Consulting insight:{' '}
                  </span>
                  <span className="text-gray-300">{insight.label}</span>
                  {malls.length > 0 && (
                    <span className="text-gray-500 text-xs ml-2">
                      ({malls.length} mall{malls.length !== 1 ? 's' : ''} within {(radius / 1000).toFixed(1)} km)
                    </span>
                  )}
                </div>
              )}

              {loading && (
                <div className="text-gray-500 text-sm py-8 text-center">Searching malls near {selectedMRT.name}…</div>
              )}

              {!loading && malls.length === 0 && (
                <div className="bg-gray-900 border border-white/8 rounded-xl p-8 text-center">
                  <p className="text-gray-400 text-sm mb-2">No shopping malls found within {(radius / 1000).toFixed(1)} km.</p>
                  <p className="text-gray-500 text-xs">Try increasing the radius or selecting a different MRT station.</p>
                </div>
              )}

              {!loading && malls.length > 0 && (
                <div className="space-y-2">
                  {malls.map((m, i) => {
                    const isPicked = pickedId === m.id
                    return (
                      <div
                        key={m.id}
                        ref={el => { rowRefs.current[m.id] = el }}
                        className={`bg-gray-900 border rounded-xl px-4 py-3.5 flex items-center gap-4 transition-all duration-300 ${
                          isPicked
                            ? 'border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                            : 'border-white/8 hover:border-white/16'
                        }`}
                      >
                        <div className="w-8 flex items-center justify-center shrink-0">
                          <Medal rank={i + 1} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{m.name}</p>
                          <p className="text-gray-400 text-xs truncate mt-0.5">
                            {m.district ? m.district.replace(/_/g, ' ') : ''}
                            {m.district && m.address ? ' · ' : ''}
                            {m.address ?? ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-semibold text-purple-400">
                            {m.distance_m < 1000
                              ? `${m.distance_m} m`
                              : `${(m.distance_m / 1000).toFixed(1)} km`}
                          </span>
                          <Stars rating={m.rating} />
                          {m.review_count != null && (
                            <span className="text-xs text-gray-400 tabular-nums">
                              {m.review_count.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Jurong East tab ──────────────────────────────────────────────── */}
          {tab === 'jurong' && (
            <div>
              {/* Location context card */}
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/8 px-4 py-3 mb-6 text-sm flex items-start gap-3">
                <span className="text-lg mt-0.5">🌆</span>
                <div>
                  <p className="font-semibold text-blue-300 mb-0.5">Jurong East Focus</p>
                  <p className="text-gray-400 text-xs">
                    EWL / NSL interchange hub · Regional centre · JEM, Westgate, IMM nearby
                    <span className="ml-2 text-blue-400/60">1.3330°N, 103.7436°E</span>
                  </p>
                </div>
              </div>

              {jurongLoading && (
                <div className="text-gray-500 text-sm py-8 text-center">Loading Jurong East intelligence…</div>
              )}

              {!jurongLoading && (
                <>
                  {/* Hawker centres section */}
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                        🍜 <span>Hawker Centres</span>
                        <span className="text-xs text-gray-500 font-normal">Jurong East district</span>
                      </h2>
                    </div>

                    {jurongHawkers.length > 0 && (
                      <PickerBar list={jurongHawkers} promptContext="in Jurong East" />
                    )}

                    {jurongHawkers.length === 0 ? (
                      <p className="text-gray-500 text-sm py-4 text-center">No hawker data for Jurong East yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {jurongHawkers.map((h, i) => <HawkerRow key={h.id} h={h} rank={i + 1} />)}
                      </div>
                    )}
                  </div>

                  {/* Malls section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                        🏬 <span>Shopping Malls</span>
                        <span className="text-xs text-gray-500 font-normal">Within 1.5 km of Jurong East MRT</span>
                      </h2>
                    </div>

                    {jurongMalls.length === 0 ? (
                      <p className="text-gray-500 text-sm py-4 text-center">No mall data near Jurong East yet.</p>
                    ) : (
                      <>
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2.5 mb-3 text-xs text-gray-300">
                          <span className="font-semibold text-amber-400">Consulting signal: </span>
                          {jurongMalls.length >= 3
                            ? 'High mall density — premium retail zone with strong foot traffic anchors'
                            : 'Moderate mall presence — established catchment with growth potential'}
                        </div>
                        <div className="space-y-2">
                          {jurongMalls.map((m, i) => {
                            const isPicked = pickedId === m.id
                            return (
                              <div
                                key={m.id}
                                ref={el => { rowRefs.current[m.id] = el }}
                                className={`bg-gray-900 border rounded-xl px-4 py-3.5 flex items-center gap-4 transition-all duration-300 ${
                                  isPicked
                                    ? 'border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                                    : 'border-white/8 hover:border-white/16'
                                }`}
                              >
                                <div className="w-8 flex items-center justify-center shrink-0">
                                  <Medal rank={i + 1} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm truncate">{m.name}</p>
                                  <p className="text-gray-400 text-xs truncate mt-0.5">{m.address ?? ''}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-xs font-semibold text-purple-400">
                                    {m.distance_m < 1000 ? `${m.distance_m} m` : `${(m.distance_m / 1000).toFixed(1)} km`}
                                  </span>
                                  <Stars rating={m.rating} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default DiscoverPage
