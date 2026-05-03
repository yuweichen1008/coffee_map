import { FC, useEffect, useState } from 'react'
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
  { name: 'Jurong East',    lat: 1.3331,  lng: 103.7424, line: 'EWL / NSL' },
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
  const [tab, setTab] = useState<'hawker' | 'malls'>('hawker')
  const [district, setDistrict] = useState('all')
  const [selectedMRT, setSelectedMRT] = useState<MRTStation>(MRT_STATIONS[0])
  const [radius, setRadius] = useState(1500)
  const [hawkers, setHawkers] = useState<HawkerResult[]>([])
  const [malls, setMalls] = useState<MallResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hawkersLoaded, setHawkersLoaded] = useState(false)

  // ── Fetch hawkers ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (district !== 'all') params.set('district', district)
    fetch(`/api/hawker-rank?${params}`)
      .then(r => r.json())
      .then(j => { setHawkers(j.results ?? []); setHawkersLoaded(true) })
      .catch(() => setHawkersLoaded(true))
      .finally(() => setLoading(false))
  }, [district])

  // ── Fetch malls when MRT or radius changes ────────────────────────────────
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

  const insight = mallInsight(malls, radius)

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
            Hawker centre rankings by popularity · Malls near any MRT station
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
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-5 pb-16">

          {/* ── Hawker Rankings tab ─────────────────────────────────────────── */}
          {tab === 'hawker' && (
            <div>
              {/* District filter */}
              <div className="flex items-center gap-3 mb-5">
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

              {loading && (
                <div className="text-gray-500 text-sm py-8 text-center">Loading hawker centres…</div>
              )}

              {!loading && hawkersLoaded && hawkers.length === 0 && (
                <div className="bg-gray-900 border border-white/8 rounded-xl p-8 text-center">
                  <p className="text-gray-400 text-sm mb-2">No hawker centres found yet.</p>
                  <p className="text-gray-500 text-xs">
                    Seed data with:{' '}
                    <code className="bg-gray-800 px-2 py-0.5 rounded text-orange-300 text-xs">
                      python3 seed_taipei_all_districts.py --city singapore --category &quot;hawker centre&quot;
                    </code>
                  </p>
                </div>
              )}

              {!loading && hawkers.length > 0 && (
                <div className="space-y-2">
                  {hawkers.map((h, i) => (
                    <div
                      key={h.id}
                      className="bg-gray-900 border border-white/8 rounded-xl px-4 py-3.5 flex items-center gap-4 hover:border-white/16 transition"
                    >
                      {/* Rank */}
                      <div className="w-8 flex items-center justify-center shrink-0">
                        <Medal rank={i + 1} />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{h.name}</p>
                        <p className="text-gray-400 text-xs truncate mt-0.5">
                          {h.district ? h.district.replace(/_/g, ' ') : ''}
                          {h.district && h.address ? ' · ' : ''}
                          {h.address ?? ''}
                        </p>
                      </div>

                      {/* Stats */}
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
                  ))}
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

              {/* Consulting insight card */}
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
                  <p className="text-gray-500 text-xs">
                    Seed data with:{' '}
                    <code className="bg-gray-800 px-2 py-0.5 rounded text-orange-300 text-xs">
                      python3 seed_taipei_all_districts.py --city singapore --category &quot;shopping mall&quot;
                    </code>
                  </p>
                </div>
              )}

              {!loading && malls.length > 0 && (
                <div className="space-y-2">
                  {malls.map((m, i) => (
                    <div
                      key={m.id}
                      className="bg-gray-900 border border-white/8 rounded-xl px-4 py-3.5 flex items-center gap-4 hover:border-white/16 transition"
                    >
                      {/* Rank */}
                      <div className="w-8 flex items-center justify-center shrink-0">
                        <Medal rank={i + 1} />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{m.name}</p>
                        <p className="text-gray-400 text-xs truncate mt-0.5">
                          {m.district ? m.district.replace(/_/g, ' ') : ''}
                          {m.district && m.address ? ' · ' : ''}
                          {m.address ?? ''}
                        </p>
                      </div>

                      {/* Distance + stats */}
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
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default DiscoverPage
