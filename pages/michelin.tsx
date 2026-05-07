import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Navbar from '../components/Navbar'

// ── Constants ─────────────────────────────────────────────────────────────────
const GUIDE_START = 2016
const GUIDE_END   = 2024
const GUIDE_SPAN  = GUIDE_END - GUIDE_START + 1  // 9 slots

// ── Data ──────────────────────────────────────────────────────────────────────
type Restaurant = {
  name: string; stars: 1 | 2 | 3; cuisine: string; chef: string
  district: string; address: string; lat: number; lng: number
  note: string
  since: number        // year first starred in SG Michelin Guide
  currentSince: number // year achieved current star count
  priceSGD: string     // $$$ or $$$$
  mrt: string          // nearest MRT station
  history?: string     // star ascension e.g. "1★ 2017 → 2★ 2018 → 3★ 2019"
}

const MICHELIN: Restaurant[] = [
  // ★★★ Supreme Command
  { name: 'Odette',         stars: 3, cuisine: 'Contemporary French',   chef: 'Julien Royer',      district: 'Marina Bay',  address: '1 St Andrew\'s Rd',  lat: 1.2895, lng: 103.8522, note: 'Seasonal tasting menu set inside National Gallery Singapore',  since: 2017, currentSince: 2019, priceSGD: '$$$$', mrt: 'City Hall',       history: '1★ 2017 → 2★ 2018 → 3★ 2019' },
  { name: 'Les Amis',       stars: 3, cuisine: 'Classic French',        chef: 'Sébastien Lepinoy', district: 'Orchard',     address: '1 Scotts Rd',        lat: 1.3041, lng: 103.8319, note: 'Haute cuisine institution — Singapore outpost of a 1994 Parisian legend', since: 2018, currentSince: 2019, priceSGD: '$$$$', mrt: 'Orchard',         history: '2★ 2018 → 3★ 2019' },
  // ★★ Grand Command
  { name: 'Shoukouwa',      stars: 2, cuisine: 'Edo-style Sushi',       chef: 'Koichiro Oshino',   district: 'Marina Bay',  address: '4 One Fullerton',    lat: 1.2844, lng: 103.8516, note: 'Intimate 10-seat omakase counter, fish flown daily from Tsukiji', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Raffles Place' },
  { name: 'Shisen Hanten',  stars: 2, cuisine: 'Sichuan Chinese',       chef: 'Chen Kentaro',      district: 'Orchard',     address: '333 Orchard Rd',     lat: 1.3015, lng: 103.8316, note: 'Four-generation Sichuan dynasty — mala tradition meets precision technique', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Orchard' },
  // ★ Field Command
  { name: 'Burnt Ends',     stars: 1, cuisine: 'Modern Barbecue',       chef: 'Dave Pynt',         district: 'Chinatown',   address: '20 Teck Lim Rd',     lat: 1.2811, lng: 103.8432, note: 'Wood-fired Australian BBQ with custom-built four-tonne kiln', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Candlenut',      stars: 1, cuisine: 'Peranakan',             chef: 'Malcolm Lee',       district: 'Queenstown',  address: '17A Dempsey Rd',     lat: 1.3069, lng: 103.8173, note: 'World\'s first Michelin-starred Peranakan restaurant — nyonya classics elevated', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Botanic Gardens' },
  { name: 'Corner House',   stars: 1, cuisine: 'Gastro-Botanica',       chef: 'Jason Tan',         district: 'Queenstown',  address: '1 Cluny Rd',         lat: 1.3140, lng: 103.8152, note: 'Colonial black-and-white bungalow inside Singapore Botanic Gardens', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Botanic Gardens' },
  { name: 'Cloudstreet',    stars: 1, cuisine: 'Contemporary',          chef: 'Rishi Naleendra',   district: 'Queenstown',  address: '13 Dempsey Rd',      lat: 1.3063, lng: 103.8162, note: 'Sri Lankan-Australian creative tasting menu at Dempsey Hill', since: 2021, currentSince: 2021, priceSGD: '$$$$', mrt: 'Queenstown' },
  { name: 'Jaan',           stars: 1, cuisine: 'British Contemporary',  chef: 'Kirk Westaway',     district: 'Marina Bay',  address: '2 Stamford Rd',      lat: 1.2953, lng: 103.8558, note: 'Elevated British produce on the 70th floor of Swissôtel The Stamford', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'City Hall' },
  { name: 'Labyrinth',      stars: 1, cuisine: 'Modern Singaporean',    chef: 'LG Han',            district: 'Marina Bay',  address: '1 Fullerton Rd',     lat: 1.2848, lng: 103.8533, note: 'Hawker street classics deconstructed as fine dining narrative', since: 2018, currentSince: 2018, priceSGD: '$$$',  mrt: 'Esplanade' },
  { name: 'Meta',           stars: 1, cuisine: 'Korean-French',         chef: 'Sun Kim',           district: 'Chinatown',   address: '9 Keong Saik Rd',    lat: 1.2802, lng: 103.8429, note: 'Korean soul with classical French technique on Keong Saik Road', since: 2017, currentSince: 2017, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Nouri',          stars: 1, cuisine: 'Cross-cultural',        chef: 'Ivan Brehm',        district: 'Chinatown',   address: '72 Amoy St',         lat: 1.2800, lng: 103.8463, note: 'Food anthropology as cuisine — explores human migration through taste', since: 2019, currentSince: 2019, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Thevar',         stars: 1, cuisine: 'Modern Indian',         chef: 'Mano Thevar',       district: 'Chinatown',   address: '9 Keong Saik Rd',    lat: 1.2803, lng: 103.8431, note: 'Progressive South Indian cooking rooted in Tamil and Malayalee traditions', since: 2020, currentSince: 2020, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Zén',            stars: 1, cuisine: 'Swedish Contemporary',  chef: 'Björn Frantzén',    district: 'Chinatown',   address: '41 Bukit Pasoh Rd',  lat: 1.2820, lng: 103.8439, note: 'Three-floor immersive Stockholm dining experience transplanted to Bukit Pasoh', since: 2019, currentSince: 2019, priceSGD: '$$$$', mrt: 'Tanjong Pagar' },
  { name: 'Waku Ghin',      stars: 1, cuisine: 'Contemporary Japanese', chef: 'Tetsuya Wakuda',    district: 'Marina Bay',  address: '10 Bayfront Ave',    lat: 1.2837, lng: 103.8595, note: 'Intimate counter dining inside Marina Bay Sands casino precinct', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Bayfront' },
  { name: 'Sommer',         stars: 1, cuisine: 'European',              chef: 'Akmal Anuar',       district: 'Orchard',     address: '1 Nassim Rd',        lat: 1.3081, lng: 103.8235, note: 'Seasonal European cuisine with subtle Middle Eastern undertones', since: 2022, currentSince: 2022, priceSGD: '$$$',  mrt: 'Orchard' },
  { name: 'Whitegrass',     stars: 1, cuisine: 'Modern Australian',     chef: 'Sam Aisbett',       district: 'Marina Bay',  address: '30 Victoria St',     lat: 1.2906, lng: 103.8530, note: 'Australian seasonal produce reimagined using Singapore-grown ingredients', since: 2019, currentSince: 2019, priceSGD: '$$$',  mrt: 'City Hall' },
  { name: 'Opening Gambit', stars: 1, cuisine: 'Modern Asian',          chef: 'Ace Tan',           district: 'Chinatown',   address: '21 Ann Siang Rd',    lat: 1.2803, lng: 103.8447, note: 'Chess-themed progressive Asian tasting menu on Ann Siang Hill', since: 2023, currentSince: 2023, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Li Bai',         stars: 1, cuisine: 'Cantonese',             chef: 'Cheong Kam Hoi',    district: 'Orchard',     address: '39 Scotts Rd',       lat: 1.3077, lng: 103.8318, note: 'Classic Cantonese fine dining at Sheraton Towers — dim sum institution', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Orchard' },
  { name: "Iggy's",         stars: 1, cuisine: 'European',              chef: 'Ignatius Chan',     district: 'Orchard',     address: '581 Orchard Rd',     lat: 1.3066, lng: 103.8300, note: 'Wine-forward eclectic dining — Singapore\'s original destination restaurant since 2004', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Orchard' },
]

// ── Tier config ───────────────────────────────────────────────────────────────
const TIER = {
  3: { color: '#ffd700', glow: 'rgba(255,215,0,0.7)',   size: 24, label: 'SUPREME COMMAND', ring: 'rgba(255,215,0,0.2)' },
  2: { color: '#e2e8f0', glow: 'rgba(226,232,240,0.6)', size: 20, label: 'GRAND COMMAND',   ring: 'rgba(226,232,240,0.15)' },
  1: { color: '#f0a500', glow: 'rgba(240,165,0,0.55)',  size: 15, label: 'FIELD COMMAND',   ring: 'rgba(240,165,0,0.12)' },
} as const

const VINTAGE_YEARS = Array.from(new Set(MICHELIN.map(r => r.since))).sort()

// ── Tenure bar ────────────────────────────────────────────────────────────────
function TenureBar({ since, stars, currentSince }: { since: number; stars: 1 | 2 | 3; currentSince: number }) {
  const upgradeYear = currentSince > since ? currentSince : null
  const tenureYrs   = GUIDE_END - since + 1
  const color       = TIER[stars].color

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: GUIDE_SPAN }, (_, i) => {
        const yr     = GUIDE_START + i
        const active = yr >= since
        const bright = active && (upgradeYear === null || yr >= upgradeYear)
        return (
          <div
            key={yr}
            title={String(yr)}
            style={{
              width: 5, height: active ? 4 : 2, borderRadius: 1,
              background: bright ? color : active ? `${color}44` : 'rgba(255,255,255,0.07)',
              flexShrink: 0,
              transformOrigin: 'bottom',
              animation: 'tenureGrow 0.35s ease both',
              animationDelay: `${80 + i * 28}ms`,
            }}
          />
        )
      })}
      <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(240,165,0,0.38)', marginLeft: 5, letterSpacing: 0.5 }}>
        {since}–{GUIDE_END} · {tenureYrs}YR
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MichelinPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map          = useRef<mapboxgl.Map | null>(null)
  const markersRef   = useRef<Record<string, mapboxgl.Marker>>({})
  const rowRefs      = useRef<Record<string, HTMLDivElement | null>>({})
  const [selected,   setSelected]   = useState<string | null>(null)
  const [mapReady,   setMapReady]   = useState(false)
  const [blinkOn,    setBlinkOn]    = useState(true)
  const [yearFilter, setYearFilter] = useState<number | null>(null)
  const [listKey,    setListKey]    = useState(0)
  const [listFading, setListFading] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setBlinkOn(b => !b), 600)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (map.current || !mapContainer.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    map.current = new mapboxgl.Map({
      container:   mapContainer.current,
      accessToken: token,
      style:       'mapbox://styles/mapbox/dark-v11',
      center:      [103.8198, 1.3521],
      zoom:        11.5,
    })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.current.on('load', () => setMapReady(true))
  }, [])

  useEffect(() => {
    if (!mapReady || !map.current) return

    MICHELIN.forEach(r => {
      const t  = TIER[r.stars]

      // Outer el: plain container — no transitions so Mapbox transform-based
      // repositioning during zoom/pan is instant (no drift/lag)
      const el = document.createElement('div')
      el.style.cssText = `width:${t.size}px; height:${t.size}px; position:relative; cursor:pointer;`

      // Inner: carries all visuals + hover transitions (isolated from Mapbox transforms)
      const inner = document.createElement('div')
      inner.style.cssText = `
        width:100%; height:100%;
        background:${t.color}; border-radius:50%;
        box-shadow:0 0 ${t.size / 2}px ${t.size / 4}px ${t.glow},
                   0 0 ${t.size * 1.5}px ${t.size / 2}px ${t.ring};
        display:flex; align-items:center; justify-content:center;
        font-size:${t.size * 0.38}px; color:#000; font-weight:900;
        font-family:serif;
        transition:transform 0.15s, box-shadow 0.15s;
      `
      inner.textContent = '★'.repeat(r.stars)
      inner.title       = `${r.name}  ${r.stars}★  since ${r.since}`

      inner.addEventListener('mouseenter', () => {
        inner.style.transform = 'scale(1.35)'
        inner.style.boxShadow = `0 0 ${t.size}px ${t.size / 2}px ${t.glow}, 0 0 ${t.size * 2.5}px ${t.size}px ${t.ring}`
        inner.style.zIndex    = '999'
      })
      inner.addEventListener('mouseleave', () => {
        inner.style.transform = 'scale(1)'
        inner.style.boxShadow = `0 0 ${t.size / 2}px ${t.size / 4}px ${t.glow}, 0 0 ${t.size * 1.5}px ${t.size / 2}px ${t.ring}`
        inner.style.zIndex    = ''
      })
      el.addEventListener('click', () => flyTo(r))

      // Pulse ring — plays once on mount
      const ring = document.createElement('div')
      ring.style.cssText = `
        position:absolute; inset:-6px; border-radius:50%;
        border:2px solid ${t.glow};
        animation:markerPulse 1.2s ease-out both;
        pointer-events:none;
      `

      el.appendChild(inner)
      el.appendChild(ring)

      markersRef.current[r.name] = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([r.lng, r.lat])
        .addTo(map.current!)
    })
  }, [mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  function flyTo(r: Restaurant) {
    map.current?.flyTo({ center: [r.lng, r.lat], zoom: 15.5, duration: 1200, essential: true })
    setSelected(r.name)
    setTimeout(() => rowRefs.current[r.name]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120)
  }

  const handleYearFilter = (yr: number | null) => {
    setListFading(true)
    setTimeout(() => {
      setYearFilter(yr)
      setListKey(k => k + 1)
      setListFading(false)
    }, 180)
  }

  const filtered = yearFilter ? MICHELIN.filter(r => r.since === yearFilter) : MICHELIN
  const tiers    = ([3, 2, 1] as const)
    .map(s => ({ stars: s, items: filtered.filter(r => r.stars === s) }))
    .filter(t => t.items.length > 0)

  const S = {
    amber:  '#f0a500',
    gold:   '#ffd700',
    border: 'rgba(240,165,0,0.22)',
    bg:     '#000814',
    panel:  '#00060f',
  }

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tenureGrow {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @keyframes markerPulse {
          0%   { transform: scale(0.8); opacity: 0.7; }
          100% { transform: scale(2.6); opacity: 0; }
        }
      `}</style>
      <Head>
        <title>Michelin Star Registry — StorePulse</title>
        <meta name="description" content="Singapore Michelin star restaurants mapped with tactical precision." />
      </Head>

      {/* Scanline overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100,
        background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.07) 3px,rgba(0,0,0,0.07) 4px)',
      }} />

      <div style={{ background: S.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 48px)' }}>

          {/* ── Map ───────────────────────────────────────────────────────── */}
          <div style={{ flex: '0 0 62%', position: 'relative', borderRight: `1px solid ${S.border}` }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {/* HUD overlay */}
            <div style={{
              position: 'absolute', top: 16, left: 16, pointerEvents: 'none',
              fontFamily: 'monospace', fontSize: 10, color: S.amber,
              letterSpacing: 2, lineHeight: 1.85, opacity: 0.75,
            }}>
              <div>SG SECTOR 01°17&apos;N 103°49&apos;E</div>
              <div>MICHELIN GUIDE {GUIDE_START}–{GUIDE_END}</div>
              <div style={{ color: S.gold }}>
                {MICHELIN.filter(r => r.stars === 3).length}× ★★★ &nbsp;
                {MICHELIN.filter(r => r.stars === 2).length}× ★★ &nbsp;
                {MICHELIN.filter(r => r.stars === 1).length}× ★
              </div>
              {yearFilter && (
                <div style={{ color: '#fff', marginTop: 3, fontSize: 9 }}>
                  ▶ CLASS OF {yearFilter} ACTIVE
                </div>
              )}
            </div>

            {/* Legend */}
            <div style={{
              position: 'absolute', bottom: 24, left: 16,
              background: 'rgba(0,6,14,0.88)', border: `1px solid ${S.border}`,
              borderRadius: 6, padding: '10px 14px',
              fontFamily: 'monospace', fontSize: 11, backdropFilter: 'blur(8px)',
            }}>
              {([3, 2, 1] as const).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: s > 1 ? 6 : 0 }}>
                  <div style={{
                    width: TIER[s].size, height: TIER[s].size, background: TIER[s].color,
                    borderRadius: '50%', boxShadow: `0 0 ${TIER[s].size / 2}px ${TIER[s].size / 4}px ${TIER[s].glow}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: TIER[s].size * 0.38, color: '#000', fontWeight: 900,
                    flexShrink: 0, fontFamily: 'serif',
                  }}>{'★'.repeat(s)}</div>
                  <span style={{ color: TIER[s].color }}>{'★'.repeat(s) + '☆'.repeat(3 - s)}</span>
                  <span style={{ color: 'rgba(240,165,0,0.45)' }}>
                    {MICHELIN.filter(r => r.stars === s).length} restaurants
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Intel Panel ───────────────────────────────────────────────── */}
          <div style={{
            flex: '0 0 38%', background: S.panel,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>

            {/* Header ──────────────────────────────────────────────────── */}
            <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 4, color: S.amber, marginBottom: 5, opacity: 0.75 }}>
                ▸ CULINARY INTEL · MICHELIN GUIDE SINGAPORE EST. {GUIDE_START}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: 1.5 }}>
                  MICHELIN STAR REGISTRY
                </span>
                <span style={{ color: S.amber, fontFamily: 'monospace', fontSize: 9 }}>
                  {blinkOn ? '▮' : '▯'}
                </span>
              </div>

              <div style={{ fontFamily: 'monospace', fontSize: 9, color: S.amber, opacity: 0.55, letterSpacing: 2, marginBottom: 12 }}>
                SINGAPORE SECTOR · {filtered.length}/{MICHELIN.length} TARGETS
                {yearFilter ? ` · CLASS ${yearFilter}` : ' · ALL CLASSES'}
              </div>

              {/* Tier stats */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 13 }}>
                {([3, 2, 1] as const).map(s => {
                  const count = filtered.filter(r => r.stars === s).length
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: count === 0 ? 0.25 : 1, transition: 'opacity 0.2s' }}>
                      <span style={{ color: TIER[s].color, fontFamily: 'monospace', fontSize: 11, textShadow: `0 0 6px ${TIER[s].glow}` }}>
                        {'★'.repeat(s)}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: TIER[s].color, fontWeight: 700 }}>
                        {count}
                      </span>
                    </div>
                  )
                })}
                <div style={{ flex: 1, height: 2, background: 'rgba(240,165,0,0.12)', borderRadius: 1 }}>
                  <div style={{
                    width: `${(filtered.length / MICHELIN.length) * 100}%`, height: '100%',
                    background: `linear-gradient(90deg, ${S.gold}, ${S.amber})`,
                    borderRadius: 1, transition: 'width 0.3s',
                  }} />
                </div>
              </div>

              {/* Vintage year filter ──────────────────────────────────── */}
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(240,165,0,0.35)', letterSpacing: 3, marginBottom: 6 }}>
                  VINTAGE CLASS
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[null, ...VINTAGE_YEARS].map(yr => {
                    const active = yr === yearFilter
                    return (
                      <button
                        key={yr ?? 'all'}
                        onClick={() => handleYearFilter(yr === yearFilter ? null : yr)}
                        style={{
                          fontFamily: 'monospace', fontSize: 9, letterSpacing: 1,
                          padding: '3px 7px', borderRadius: 3,
                          border: `1px solid ${active ? S.amber : 'rgba(240,165,0,0.18)'}`,
                          background: active ? 'rgba(240,165,0,0.14)' : 'transparent',
                          color: active ? S.amber : 'rgba(240,165,0,0.38)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {yr ?? 'ALL'}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Restaurant list ──────────────────────────────────────────── */}
            <div key={listKey} style={{ flex: 1, overflowY: 'auto', paddingBottom: 24, transition: 'opacity 0.18s', opacity: listFading ? 0.3 : 1 }}>
              {tiers.map(({ stars, items }) => {
                const t = TIER[stars]
                return (
                  <div key={stars}>

                    {/* Section header */}
                    <div style={{
                      padding: '8px 20px 7px',
                      background: t.ring,
                      borderBottom: `1px solid ${t.color}20`,
                      display: 'flex', alignItems: 'center', gap: 10,
                      position: 'sticky', top: 0, zIndex: 10,
                    }}>
                      <span style={{ color: t.color, fontFamily: 'monospace', fontSize: 12, fontWeight: 900, textShadow: `0 0 8px ${t.glow}` }}>
                        {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: t.color, letterSpacing: 3, opacity: 0.8 }}>
                        {t.label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 9, color: t.color, opacity: 0.45 }}>
                        {items.length} ID
                      </span>
                    </div>

                    {/* Rows */}
                    {items.map((r, idx) => {
                      const isSel = selected === r.name
                      return (
                        <div
                          key={r.name}
                          ref={el => { rowRefs.current[r.name] = el }}
                          onClick={() => flyTo(r)}
                          style={{
                            padding: '10px 18px 10px 20px',
                            borderBottom: `1px solid rgba(240,165,0,0.05)`,
                            borderLeft: isSel ? `3px solid ${t.color}` : '3px solid transparent',
                            background: isSel ? 'rgba(240,165,0,0.06)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s, border-left-color 0.15s',
                            animation: 'fadeSlideIn 0.38s ease both',
                            animationDelay: `${idx * 38}ms`,
                          }}
                          onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'rgba(240,165,0,0.03)' }}
                          onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                        >
                          {/* Line 1 — index · name · year badge · stars */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.28)', minWidth: 16 }}>
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span style={{
                              fontFamily: 'monospace', fontSize: 12, fontWeight: 700, flex: 1,
                              color: isSel ? t.color : '#e2e8f0', letterSpacing: 0.5,
                              textShadow: isSel ? `0 0 12px ${t.glow}` : 'none',
                            }}>
                              {r.name.toUpperCase()}
                            </span>
                            {/* Year badge */}
                            <span style={{
                              fontFamily: 'monospace', fontSize: 8, letterSpacing: 0.5,
                              color: t.color, opacity: 0.8,
                              border: `1px solid ${t.color}44`,
                              padding: '1px 5px', borderRadius: 2,
                              background: `${t.color}10`, flexShrink: 0,
                            }}>
                              {r.since}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: 10, color: t.color, letterSpacing: 1, flexShrink: 0 }}>
                              {'★'.repeat(stars)}
                            </span>
                          </div>

                          {/* Line 2 — cuisine · chef · MRT · price */}
                          <div style={{ display: 'flex', gap: 5, marginBottom: 5, paddingLeft: 23, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.55)', letterSpacing: 0.8 }}>
                              {r.cuisine.toUpperCase()}
                            </span>
                            <span style={{ color: 'rgba(240,165,0,0.2)', fontFamily: 'monospace' }}>·</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                              {r.chef}
                            </span>
                            <span style={{ color: 'rgba(240,165,0,0.2)', fontFamily: 'monospace' }}>·</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.42)' }}>
                              {r.mrt} MRT
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,215,0,0.45)', letterSpacing: 0.5 }}>
                              {r.priceSGD}
                            </span>
                          </div>

                          {/* Line 3 — tenure bar */}
                          <div style={{ paddingLeft: 23, marginBottom: r.history ? 4 : 0 }}>
                            <TenureBar since={r.since} stars={r.stars} currentSince={r.currentSince} />
                          </div>

                          {/* Line 4 — star ascension history */}
                          {r.history && (
                            <div style={{ paddingLeft: 23, marginTop: 3 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,215,0,0.55)', letterSpacing: 0.5 }}>
                                ↑ {r.history}
                              </span>
                            </div>
                          )}

                          {/* Expanded note when selected */}
                          {isSel && (
                            <div style={{
                              marginTop: 8, paddingLeft: 23,
                              fontFamily: 'monospace', fontSize: 9,
                              color: 'rgba(240,165,0,0.62)',
                              borderTop: `1px solid ${t.color}15`, paddingTop: 6,
                              letterSpacing: 0.5, lineHeight: 1.6,
                            }}>
                              ▸ {r.note}
                              <div style={{ marginTop: 4, color: 'rgba(240,165,0,0.35)' }}>
                                {r.address} · {r.district}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Empty state */}
              {filtered.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'monospace', fontSize: 10, color: 'rgba(240,165,0,0.3)' }}>
                  NO TARGETS IN CLASS {yearFilter}
                </div>
              )}

              {/* Footer */}
              <div style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.18)', letterSpacing: 2, lineHeight: 2 }}>
                <div>SOURCE: MICHELIN GUIDE SINGAPORE {GUIDE_START}–{GUIDE_END}</div>
                <div>CLASSIFICATION: CULINARY INTELLIGENCE DIVISION</div>
                <div>SELECT TARGET TO ACQUIRE COORDINATES</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
