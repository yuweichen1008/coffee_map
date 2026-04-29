import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Navbar from '../components/Navbar'

// ── Data ──────────────────────────────────────────────────────────────────────
type Restaurant = {
  name: string; stars: 1 | 2 | 3; cuisine: string; chef: string
  district: string; address: string; lat: number; lng: number; note: string
}

const MICHELIN: Restaurant[] = [
  // ★★★ Supreme Command
  { name: 'Odette',         stars: 3, cuisine: 'Contemporary French',   chef: 'Julien Royer',       district: 'Marina Bay',  address: '1 St Andrew\'s Rd',  lat: 1.2895, lng: 103.8522, note: 'Seasonal tasting menu in National Gallery Singapore' },
  { name: 'Les Amis',       stars: 3, cuisine: 'Classic French',        chef: 'Sébastien Lepinoy',  district: 'Orchard',     address: '1 Scotts Rd',        lat: 1.3041, lng: 103.8319, note: 'Haute cuisine institution in Singapore since 1994' },
  // ★★ Grand Command
  { name: 'Shoukouwa',      stars: 2, cuisine: 'Edo-style Sushi',       chef: 'Koichiro Oshino',    district: 'Marina Bay',  address: '4 One Fullerton',    lat: 1.2844, lng: 103.8516, note: 'Intimate 10-seat omakase sushi counter' },
  { name: 'Shisen Hanten',  stars: 2, cuisine: 'Sichuan Chinese',       chef: 'Chen Kentaro',       district: 'Orchard',     address: '333 Orchard Rd',     lat: 1.3015, lng: 103.8316, note: 'Four-generation Sichuan culinary dynasty' },
  // ★ Field Command
  { name: 'Burnt Ends',     stars: 1, cuisine: 'Modern Barbecue',       chef: 'Dave Pynt',          district: 'Chinatown',   address: '20 Teck Lim Rd',     lat: 1.2811, lng: 103.8432, note: 'Wood-fired Australian BBQ, cult following' },
  { name: 'Candlenut',      stars: 1, cuisine: 'Peranakan',             chef: 'Malcolm Lee',        district: 'Queenstown',  address: '17A Dempsey Rd',     lat: 1.3069, lng: 103.8173, note: 'World\'s first Michelin-starred Peranakan restaurant' },
  { name: 'Corner House',   stars: 1, cuisine: 'Gastro-Botanica',       chef: 'Jason Tan',          district: 'Queenstown',  address: '1 Cluny Rd',         lat: 1.3140, lng: 103.8152, note: 'Colonial bungalow dining inside Botanic Gardens' },
  { name: 'Cloudstreet',    stars: 1, cuisine: 'Contemporary',          chef: 'Rishi Naleendra',    district: 'Queenstown',  address: '13 Dempsey Rd',      lat: 1.3063, lng: 103.8162, note: 'Sri Lankan-Australian creative tasting menu' },
  { name: 'Jaan',           stars: 1, cuisine: 'British Contemporary',  chef: 'Kirk Westaway',      district: 'Marina Bay',  address: '2 Stamford Rd',      lat: 1.2953, lng: 103.8558, note: 'Elevated British on the 70th floor of Swissôtel' },
  { name: 'Labyrinth',      stars: 1, cuisine: 'Modern Singaporean',    chef: 'LG Han',             district: 'Marina Bay',  address: '1 Fullerton Rd',     lat: 1.2848, lng: 103.8533, note: 'Hawker classics reimagined as fine dining' },
  { name: 'Meta',           stars: 1, cuisine: 'Korean-French',         chef: 'Sun Kim',            district: 'Chinatown',   address: '9 Keong Saik Rd',    lat: 1.2802, lng: 103.8429, note: 'Korean soul with classical French technique' },
  { name: 'Nouri',          stars: 1, cuisine: 'Cross-cultural',        chef: 'Ivan Brehm',         district: 'Chinatown',   address: '72 Amoy St',         lat: 1.2800, lng: 103.8463, note: 'Food anthropology explored as cuisine' },
  { name: 'Thevar',         stars: 1, cuisine: 'Modern Indian',         chef: 'Mano Thevar',        district: 'Chinatown',   address: '9 Keong Saik Rd',    lat: 1.2803, lng: 103.8431, note: 'Progressive South Indian cooking' },
  { name: 'Zén',            stars: 1, cuisine: 'Swedish Contemporary',  chef: 'Björn Frantzén',     district: 'Chinatown',   address: '41 Bukit Pasoh Rd',  lat: 1.2820, lng: 103.8439, note: 'Three-floor immersive Stockholm dining experience' },
  { name: 'Waku Ghin',      stars: 1, cuisine: 'Contemporary Japanese', chef: 'Tetsuya Wakuda',     district: 'Marina Bay',  address: '10 Bayfront Ave',    lat: 1.2837, lng: 103.8595, note: 'Counter dining at Marina Bay Sands' },
  { name: 'Sommer',         stars: 1, cuisine: 'European',              chef: 'Akmal Anuar',        district: 'Orchard',     address: '1 Nassim Rd',        lat: 1.3081, lng: 103.8235, note: 'Seasonal European with Middle Eastern nuance' },
  { name: 'Whitegrass',     stars: 1, cuisine: 'Modern Australian',     chef: 'Sam Aisbett',        district: 'Marina Bay',  address: '30 Victoria St',     lat: 1.2906, lng: 103.8530, note: 'Australian seasonal cuisine using Singapore produce' },
  { name: 'Opening Gambit', stars: 1, cuisine: 'Modern Asian',          chef: 'Ace Tan',            district: 'Chinatown',   address: '21 Ann Siang Rd',    lat: 1.2803, lng: 103.8447, note: 'Chess-themed progressive Asian tasting menu' },
  { name: 'Li Bai',         stars: 1, cuisine: 'Cantonese',             chef: 'Cheong Kam Hoi',     district: 'Orchard',     address: '39 Scotts Rd',       lat: 1.3077, lng: 103.8318, note: 'Classic Cantonese fine dining at Sheraton' },
  { name: "Iggy's",         stars: 1, cuisine: 'European',              chef: 'Ignatius Chan',      district: 'Orchard',     address: '581 Orchard Rd',     lat: 1.3066, lng: 103.8300, note: 'Wine-forward eclectic dining since 2004' },
]

// ── Star config ───────────────────────────────────────────────────────────────
const TIER = {
  3: { color: '#ffd700', glow: 'rgba(255,215,0,0.7)',  size: 24, label: 'SUPREME COMMAND', ring: 'rgba(255,215,0,0.2)' },
  2: { color: '#e2e8f0', glow: 'rgba(226,232,240,0.6)', size: 20, label: 'GRAND COMMAND',   ring: 'rgba(226,232,240,0.15)' },
  1: { color: '#f0a500', glow: 'rgba(240,165,0,0.55)', size: 15, label: 'FIELD COMMAND',    ring: 'rgba(240,165,0,0.12)' },
} as const

function starStr(n: number) { return '★'.repeat(n) + '☆'.repeat(3 - n) }

// ── Component ─────────────────────────────────────────────────────────────────
export default function MichelinPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map          = useRef<mapboxgl.Map | null>(null)
  const markersRef   = useRef<Record<string, mapboxgl.Marker>>({})
  const rowRefs      = useRef<Record<string, HTMLDivElement | null>>({})
  const listRef      = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [mapReady,  setMapReady]  = useState(false)
  const [blinkOn,   setBlinkOn]   = useState(true)

  // ── Cursor blink ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setBlinkOn(b => !b), 600)
    return () => clearInterval(id)
  }, [])

  // ── Map init ──────────────────────────────────────────────────────────────
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

  // ── Add markers when map is ready ────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !map.current) return

    MICHELIN.forEach(r => {
      const t = TIER[r.stars]
      const el = document.createElement('div')
      el.style.cssText = `
        width:${t.size}px; height:${t.size}px;
        background:${t.color};
        border-radius:50%;
        box-shadow:0 0 ${t.size/2}px ${t.size/4}px ${t.glow}, 0 0 ${t.size*1.5}px ${t.size/2}px ${t.ring};
        display:flex; align-items:center; justify-content:center;
        font-size:${t.size * 0.38}px; color:#000; font-weight:900;
        cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;
        font-family:serif;
      `
      el.textContent = '★'.repeat(r.stars)
      el.title = r.name

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.35)'
        el.style.boxShadow = `0 0 ${t.size}px ${t.size/2}px ${t.glow}, 0 0 ${t.size*2.5}px ${t.size}px ${t.ring}`
        el.style.zIndex = '999'
      })
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)'
        el.style.boxShadow = `0 0 ${t.size/2}px ${t.size/4}px ${t.glow}, 0 0 ${t.size*1.5}px ${t.size/2}px ${t.ring}`
        el.style.zIndex = ''
      })
      el.addEventListener('click', () => {
        flyTo(r)
      })

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([r.lng, r.lat])
        .addTo(map.current!)

      markersRef.current[r.name] = marker
    })
  }, [mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly + select ──────────────────────────────────────────────────────────
  function flyTo(r: Restaurant) {
    map.current?.flyTo({ center: [r.lng, r.lat], zoom: 15.5, duration: 1200, essential: true })
    setSelected(r.name)
    setTimeout(() => {
      const row = rowRefs.current[r.name]
      row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 120)
  }

  const tiers = ([3, 2, 1] as const).map(s => ({
    stars: s,
    items: MICHELIN.filter(r => r.stars === s),
  }))

  const S = { // shared style tokens
    amber:  '#f0a500',
    gold:   '#ffd700',
    silver: '#e2e8f0',
    dim:    'rgba(240,165,0,0.18)',
    border: 'rgba(240,165,0,0.22)',
    bg:     '#000814',
    panel:  '#00060f',
  }

  return (
    <>
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

            {/* Corner overlay — tactical HUD feel */}
            <div style={{
              position: 'absolute', top: 16, left: 16, pointerEvents: 'none',
              fontFamily: 'monospace', fontSize: 10, color: S.amber, letterSpacing: 2,
              lineHeight: 1.8, opacity: 0.7,
            }}>
              <div>SG SECTOR 01°17&apos;N 103°49&apos;E</div>
              <div>CULINARY TARGETS OVERLAID</div>
              <div style={{ color: S.gold }}>{'● '.repeat(3)}SUPREME  {'◉ '.repeat(2)}GRAND  {'· '.repeat(1)}FIELD</div>
            </div>

            {/* Legend */}
            <div style={{
              position: 'absolute', bottom: 24, left: 16,
              background: 'rgba(0,6,14,0.85)', border: `1px solid ${S.border}`,
              borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: 11,
              backdropFilter: 'blur(8px)',
            }}>
              {([3, 2, 1] as const).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: s > 1 ? 6 : 0 }}>
                  <div style={{
                    width: TIER[s].size, height: TIER[s].size,
                    background: TIER[s].color, borderRadius: '50%',
                    boxShadow: `0 0 ${TIER[s].size/2}px ${TIER[s].size/4}px ${TIER[s].glow}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: TIER[s].size * 0.38, color: '#000', fontWeight: 900, flexShrink: 0,
                  }}>{'★'.repeat(s)}</div>
                  <span style={{ color: TIER[s].color }}>{starStr(s)}</span>
                  <span style={{ color: 'rgba(240,165,0,0.5)' }}>{MICHELIN.filter(r => r.stars === s).length} restaurants</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Intel Panel ───────────────────────────────────────────────── */}
          <div style={{
            flex: '0 0 38%', background: S.panel, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>

            {/* Header */}
            <div style={{
              padding: '18px 20px 14px', borderBottom: `1px solid ${S.border}`,
              flexShrink: 0,
            }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 4, color: S.amber, marginBottom: 6, opacity: 0.8 }}>
                ▸ CULINARY INTELLIGENCE DIVISION · MICHELIN GUIDE 2024
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: 2 }}>
                  MICHELIN STAR REGISTRY
                </span>
                <span style={{ color: S.amber, fontFamily: 'monospace', fontSize: 9 }}>
                  {blinkOn ? '▮' : '▯'}
                </span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: S.amber, marginTop: 4, opacity: 0.7, letterSpacing: 2 }}>
                SINGAPORE SECTOR · {MICHELIN.length} TARGETS IDENTIFIED
              </div>

              {/* Tier stat bar */}
              <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
                {([3, 2, 1] as const).map(s => {
                  const count = MICHELIN.filter(r => r.stars === s).length
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: TIER[s].color, fontFamily: 'monospace', fontSize: 11, textShadow: `0 0 6px ${TIER[s].glow}` }}>
                        {'★'.repeat(s)}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: TIER[s].color, fontWeight: 700 }}>
                        {count}
                      </span>
                    </div>
                  )
                })}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1, height: 2, background: S.dim, borderRadius: 1 }}>
                    <div style={{ width: '100%', height: '100%', background: `linear-gradient(90deg, ${S.gold}, ${S.amber})`, borderRadius: 1, opacity: 0.6 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Restaurant list */}
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }}>
              {tiers.map(({ stars, items }) => {
                const t = TIER[stars]
                return (
                  <div key={stars}>
                    {/* Section header */}
                    <div style={{
                      padding: '10px 20px 8px',
                      background: `${t.ring}`,
                      borderBottom: `1px solid ${t.color}22`,
                      display: 'flex', alignItems: 'center', gap: 10,
                      position: 'sticky', top: 0, zIndex: 10,
                    }}>
                      <span style={{ color: t.color, fontFamily: 'monospace', fontSize: 13, fontWeight: 900, textShadow: `0 0 8px ${t.glow}`, letterSpacing: 1 }}>
                        {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: t.color, letterSpacing: 3, opacity: 0.8 }}>
                        {t.label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 9, color: t.color, opacity: 0.5 }}>
                        {items.length} IDENTIFIED
                      </span>
                    </div>

                    {/* Restaurant rows */}
                    {items.map((r, idx) => {
                      const isSelected = selected === r.name
                      return (
                        <div
                          key={r.name}
                          ref={el => { rowRefs.current[r.name] = el }}
                          onClick={() => flyTo(r)}
                          style={{
                            padding: '10px 20px',
                            borderBottom: `1px solid rgba(240,165,0,0.07)`,
                            borderLeft: isSelected ? `3px solid ${t.color}` : '3px solid transparent',
                            background: isSelected ? `rgba(240,165,0,0.07)` : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s, border-left-color 0.15s',
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(240,165,0,0.04)'
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                          }}
                        >
                          {/* Row header */}
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.35)', minWidth: 18 }}>
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span style={{
                              fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
                              color: isSelected ? t.color : '#e2e8f0',
                              letterSpacing: 0.5, flex: 1,
                              textShadow: isSelected ? `0 0 12px ${t.glow}` : 'none',
                            }}>
                              {r.name.toUpperCase()}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: 10, color: t.color, letterSpacing: 1 }}>
                              {'★'.repeat(stars)}
                            </span>
                          </div>

                          {/* Cuisine + Chef */}
                          <div style={{ display: 'flex', gap: 6, marginBottom: 3, paddingLeft: 26 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.55)', letterSpacing: 1 }}>
                              {r.cuisine.toUpperCase()}
                            </span>
                            <span style={{ color: 'rgba(240,165,0,0.25)', fontFamily: 'monospace', fontSize: 9 }}>·</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                              {r.chef}
                            </span>
                          </div>

                          {/* Address */}
                          <div style={{ paddingLeft: 26 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.3)' }}>
                              {r.address} · {r.district}
                            </span>
                          </div>

                          {/* Note — show when selected */}
                          {isSelected && (
                            <div style={{
                              marginTop: 6, paddingLeft: 26,
                              fontFamily: 'monospace', fontSize: 9,
                              color: 'rgba(240,165,0,0.65)',
                              borderTop: `1px solid ${t.color}20`, paddingTop: 6,
                              letterSpacing: 0.5, lineHeight: 1.5,
                            }}>
                              ▸ {r.note}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Footer */}
              <div style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: 9, color: 'rgba(240,165,0,0.25)', letterSpacing: 2, lineHeight: 1.8 }}>
                <div>SOURCE: MICHELIN GUIDE SINGAPORE 2024</div>
                <div>CLASSIFICATION: CULINARY INTELLIGENCE</div>
                <div>SELECT TARGET TO ACQUIRE COORDINATES</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
