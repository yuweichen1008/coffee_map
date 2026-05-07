import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Navbar from '../components/Navbar'

// ── Constants ─────────────────────────────────────────────────────────────────
const GUIDE_START = 2016
const GUIDE_END   = 2024
const GUIDE_SPAN  = GUIDE_END - GUIDE_START + 1

// ── Types ─────────────────────────────────────────────────────────────────────
type Restaurant = {
  name: string; stars: 1 | 2 | 3; cuisine: string; chef: string
  district: string; address: string; lat: number; lng: number
  note: string; since: number; currentSince: number
  priceSGD: string; mrt: string; history?: string
}

type BibRestaurant = {
  name: string; cuisine: string
  district: string; address: string; lat: number; lng: number
  note: string; since: number; mrt: string
}

// ── Starred restaurants ───────────────────────────────────────────────────────
const MICHELIN: Restaurant[] = [
  { name: 'Odette',          stars: 3, cuisine: 'Contemporary French',   chef: 'Julien Royer',      district: 'Marina Bay',    address: '1 St Andrew\'s Rd',    lat: 1.2895, lng: 103.8522, note: 'Seasonal tasting menu inside National Gallery Singapore — produce-driven, technique-precise', since: 2017, currentSince: 2019, priceSGD: '$$$$', mrt: 'City Hall',        history: '1★ 2017 → 2★ 2018 → 3★ 2019' },
  { name: 'Les Amis',        stars: 3, cuisine: 'Classic French',        chef: 'Sébastien Lepinoy', district: 'Orchard',       address: '1 Scotts Rd',          lat: 1.3041, lng: 103.8319, note: 'Haute cuisine institution — Singapore outpost of a 1994 Parisian legend', since: 2018, currentSince: 2019, priceSGD: '$$$$', mrt: 'Orchard',          history: '2★ 2018 → 3★ 2019' },
  { name: 'Shoukouwa',       stars: 2, cuisine: 'Edo-style Sushi',       chef: 'Koichiro Oshino',   district: 'Marina Bay',    address: '4 One Fullerton',      lat: 1.2844, lng: 103.8516, note: 'Intimate 10-seat omakase counter, fish flown daily from Tsukiji market', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Raffles Place' },
  { name: 'Shisen Hanten',   stars: 2, cuisine: 'Sichuan Chinese',       chef: 'Chen Kentaro',      district: 'Orchard',       address: '333 Orchard Rd',       lat: 1.3015, lng: 103.8316, note: 'Four-generation Sichuan dynasty — mala tradition meets Japanese precision', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Orchard' },
  { name: 'Burnt Ends',      stars: 1, cuisine: 'Modern Barbecue',       chef: 'Dave Pynt',         district: 'Chinatown',     address: '20 Teck Lim Rd',       lat: 1.2811, lng: 103.8432, note: 'Wood-fired Australian BBQ with custom-built four-tonne kiln', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Candlenut',       stars: 1, cuisine: 'Peranakan',             chef: 'Malcolm Lee',       district: 'Queenstown',    address: '17A Dempsey Rd',       lat: 1.3069, lng: 103.8173, note: 'World\'s first Michelin-starred Peranakan restaurant — nyonya classics elevated', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Botanic Gardens' },
  { name: 'Corner House',    stars: 1, cuisine: 'Gastro-Botanica',       chef: 'Jason Tan',         district: 'Queenstown',    address: '1 Cluny Rd',           lat: 1.3140, lng: 103.8152, note: 'Colonial bungalow inside Singapore Botanic Gardens — garden-to-table philosophy', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Botanic Gardens' },
  { name: 'Cloudstreet',     stars: 1, cuisine: 'Contemporary',          chef: 'Rishi Naleendra',   district: 'Queenstown',    address: '13 Dempsey Rd',        lat: 1.3063, lng: 103.8162, note: 'Sri Lankan-Australian creative tasting menu at Dempsey Hill', since: 2021, currentSince: 2021, priceSGD: '$$$$', mrt: 'Queenstown' },
  { name: 'Jaan',            stars: 1, cuisine: 'British Contemporary',  chef: 'Kirk Westaway',     district: 'Marina Bay',    address: '2 Stamford Rd',        lat: 1.2953, lng: 103.8558, note: 'British produce on the 70th floor of Swissôtel — sweeping city views', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'City Hall' },
  { name: 'Labyrinth',       stars: 1, cuisine: 'Modern Singaporean',    chef: 'LG Han',            district: 'Marina Bay',    address: '1 Fullerton Rd',       lat: 1.2848, lng: 103.8533, note: 'Hawker street classics deconstructed as fine dining narrative', since: 2018, currentSince: 2018, priceSGD: '$$$',  mrt: 'Esplanade' },
  { name: 'Meta',            stars: 1, cuisine: 'Korean-French',         chef: 'Sun Kim',           district: 'Chinatown',     address: '9 Keong Saik Rd',      lat: 1.2802, lng: 103.8429, note: 'Korean soul with classical French technique on Keong Saik Road', since: 2017, currentSince: 2017, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Nouri',           stars: 1, cuisine: 'Cross-cultural',        chef: 'Ivan Brehm',        district: 'Chinatown',     address: '72 Amoy St',           lat: 1.2800, lng: 103.8463, note: 'Food anthropology as cuisine — explores human migration through taste', since: 2019, currentSince: 2019, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Thevar',          stars: 1, cuisine: 'Modern Indian',         chef: 'Mano Thevar',       district: 'Chinatown',     address: '9 Keong Saik Rd',      lat: 1.2803, lng: 103.8431, note: 'Progressive South Indian cooking rooted in Tamil and Malayalee traditions', since: 2020, currentSince: 2020, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Zén',             stars: 1, cuisine: 'Swedish Contemporary',  chef: 'Björn Frantzén',    district: 'Chinatown',     address: '41 Bukit Pasoh Rd',    lat: 1.2820, lng: 103.8439, note: 'Three-floor immersive Stockholm dining experience transplanted to Bukit Pasoh', since: 2019, currentSince: 2019, priceSGD: '$$$$', mrt: 'Tanjong Pagar' },
  { name: 'Waku Ghin',       stars: 1, cuisine: 'Contemporary Japanese', chef: 'Tetsuya Wakuda',    district: 'Marina Bay',    address: '10 Bayfront Ave',      lat: 1.2837, lng: 103.8595, note: 'Intimate counter dining inside Marina Bay Sands — counter-style omakase', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Bayfront' },
  { name: 'Sommer',          stars: 1, cuisine: 'European',              chef: 'Akmal Anuar',       district: 'Orchard',       address: '1 Nassim Rd',          lat: 1.3081, lng: 103.8235, note: 'Seasonal European cuisine with subtle Middle Eastern undertones at Nassim Hill', since: 2022, currentSince: 2022, priceSGD: '$$$',  mrt: 'Orchard' },
  { name: 'Whitegrass',      stars: 1, cuisine: 'Modern Australian',     chef: 'Sam Aisbett',       district: 'Marina Bay',    address: '30 Victoria St',       lat: 1.2906, lng: 103.8530, note: 'Australian seasonal produce reimagined using Singapore-grown ingredients', since: 2019, currentSince: 2019, priceSGD: '$$$',  mrt: 'City Hall' },
  { name: 'Opening Gambit',  stars: 1, cuisine: 'Modern Asian',          chef: 'Ace Tan',           district: 'Chinatown',     address: '21 Ann Siang Rd',      lat: 1.2803, lng: 103.8447, note: 'Chess-themed progressive Asian tasting menu on Ann Siang Hill', since: 2023, currentSince: 2023, priceSGD: '$$$',  mrt: 'Tanjong Pagar' },
  { name: 'Li Bai',          stars: 1, cuisine: 'Cantonese',             chef: 'Cheong Kam Hoi',    district: 'Orchard',       address: '39 Scotts Rd',         lat: 1.3077, lng: 103.8318, note: 'Classic Cantonese fine dining at Sheraton Towers — dim sum institution', since: 2016, currentSince: 2016, priceSGD: '$$$',  mrt: 'Orchard' },
  { name: "Iggy's",          stars: 1, cuisine: 'European',              chef: 'Ignatius Chan',     district: 'Orchard',       address: '581 Orchard Rd',       lat: 1.3066, lng: 103.8300, note: 'Wine-forward eclectic dining — Singapore\'s original destination restaurant since 2004', since: 2016, currentSince: 2016, priceSGD: '$$$$', mrt: 'Orchard' },
]

// ── Bib Gourmand ─────────────────────────────────────────────────────────────
const BIB_GOURMAND: BibRestaurant[] = [
  { name: 'Hawker Chan',                     cuisine: 'Hainanese Chicken Rice', district: 'Chinatown',     address: '78 Smith St',             lat: 1.2820, lng: 103.8452, note: 'World\'s cheapest Michelin meal — soya sauce chicken rice from $3.50, run by chef Liao Fan', since: 2016, mrt: 'Chinatown' },
  { name: 'Hill Street Tai Hwa Pork Noodle', cuisine: 'Bak Chor Mee',           district: 'Lavender',      address: '466 Crawford Ln',         lat: 1.3077, lng: 103.8640, note: 'Legendary bak chor mee with springy noodles — 90-min queue common; third-generation family stall since 1932', since: 2016, mrt: 'Lavender' },
  { name: 'Lian He Ben Ji Claypot Rice',     cuisine: 'Claypot Rice',            district: 'Chinatown',     address: '335 Smith St #02-197',    lat: 1.2817, lng: 103.8437, note: 'Charcoal-fired claypot rice at Chinatown Complex — the 45-minute wait is part of the ritual', since: 2016, mrt: 'Chinatown' },
  { name: 'Ng Ah Sio Bak Kut Teh',           cuisine: 'Bak Kut Teh',             district: 'Novena',        address: '208 Rangoon Rd',          lat: 1.3208, lng: 103.8444, note: 'Peppery Teochew-style bak kut teh with 60+ years of heritage — claypot option is the go-to', since: 2016, mrt: 'Farrer Park' },
  { name: 'Kok Sen Restaurant',              cuisine: 'Cantonese Zi Char',       district: 'Chinatown',     address: '30 Keong Saik Rd',        lat: 1.2795, lng: 103.8429, note: 'Classic zi char with killer wok hei — prawn paste chicken and oyster omelette are the must-orders', since: 2016, mrt: 'Tanjong Pagar' },
  { name: 'Hong Kong Soya Sauce Chicken',    cuisine: 'Chicken Rice',            district: 'Chinatown',     address: '335 Smith St #02-126',    lat: 1.2818, lng: 103.8438, note: 'Chinatown Complex hawker — soya sauce chicken with savoury-sweet glaze; Michelin two years running', since: 2018, mrt: 'Chinatown' },
  { name: 'Famous Sungei Road Trishaw Laksa', cuisine: 'Laksa',                  district: 'Bugis',         address: '531A Upper Cross St',     lat: 1.2856, lng: 103.8432, note: 'Thick, concentrated lemak broth voted consistently among Singapore\'s best laksa', since: 2018, mrt: 'Clarke Quay' },
  { name: 'Noodle Story',                    cuisine: 'Wonton Noodles',          district: 'Chinatown',     address: '335 Smith St #02-031',    lat: 1.2816, lng: 103.8436, note: 'Japanese-influenced wonton noodles — springy noodles, crispy lard, HK-SG fusion twist', since: 2018, mrt: 'Chinatown' },
  { name: 'Zai Shun Curry Fish Head',        cuisine: 'Cantonese Zi Char',       district: 'Jurong_East',   address: '253 Jurong East St 24',   lat: 1.3375, lng: 103.7350, note: 'West-side institution — curry fish head with thick, flavourful gravy; Cantonese home cooking at scale', since: 2017, mrt: 'Jurong East' },
  { name: 'One Prawn & Co',                  cuisine: 'Prawn Noodles',           district: 'Tanjong_Pagar', address: '117 Tanjong Pagar Plaza', lat: 1.2766, lng: 103.8422, note: 'Modern hawker take on prawn mee — rich prawn broth, premium toppings; chef-driven concept', since: 2019, mrt: 'Tanjong Pagar' },
  { name: 'Rong Cheng Bak Kut Teh',          cuisine: 'Bak Kut Teh',             district: 'Toa_Payoh',     address: '22 Toa Payoh Lorong 7',   lat: 1.3283, lng: 103.8480, note: 'Dark peppery Teochew bak kut teh — claypot option serves a crowd; morning queues are dedicated', since: 2019, mrt: 'Toa Payoh' },
  { name: 'Chuan Kee Boneless Braised Duck', cuisine: 'Braised Duck Rice',        district: 'Jurong_East',   address: '127 Taman Jurong Market', lat: 1.3395, lng: 103.7316, note: 'Boneless braised duck in soy-fragrant Teochew baste — a west-side legend', since: 2018, mrt: 'Jurong East' },
]

// ── Tier config ───────────────────────────────────────────────────────────────
const TIER = {
  3: { color: '#FFD700', glow: 'rgba(255,215,0,0.5)',   size: 22, label: 'Exceptional Cuisine — worth a special journey' },
  2: { color: '#C0C0C0', glow: 'rgba(192,192,192,0.45)', size: 18, label: 'Excellent Cooking — worth a detour' },
  1: { color: '#F0A500', glow: 'rgba(240,165,0,0.45)',  size: 14, label: 'High Quality Cooking — worth a stop' },
} as const

const RED   = '#E4002B'
const RED_G = 'rgba(228,0,43,0.4)'

const VINTAGE_YEARS = Array.from(new Set(MICHELIN.map(r => r.since))).sort()

// ── Tenure bar ────────────────────────────────────────────────────────────────
function TenureBar({ since, color, upgradeYear }: { since: number; color: string; upgradeYear?: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: GUIDE_SPAN }, (_, i) => {
        const yr     = GUIDE_START + i
        const active = yr >= since
        const bright = active && (!upgradeYear || yr >= upgradeYear)
        return (
          <div
            key={yr}
            title={String(yr)}
            style={{
              width: 5, height: active ? 5 : 2, borderRadius: 1,
              background: active
                ? bright ? color : `${color}44`
                : 'rgba(255,255,255,0.06)',
              flexShrink: 0,
              transformOrigin: 'bottom',
              animation: 'tenureGrow 0.35s ease both',
              animationDelay: `${80 + i * 28}ms`,
            }}
          />
        )
      })}
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', marginLeft: 6, letterSpacing: 0.3 }}>
        {since}–{GUIDE_END} · {GUIDE_END - since + 1}yr
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Tab = 'starred' | 'bib'

export default function MichelinPage() {
  const mapContainer    = useRef<HTMLDivElement>(null)
  const map             = useRef<mapboxgl.Map | null>(null)
  const starMarkers     = useRef<Record<string, mapboxgl.Marker>>({})
  const bibMarkers      = useRef<Record<string, mapboxgl.Marker>>({})
  const rowRefs         = useRef<Record<string, HTMLDivElement | null>>({})
  const [selected,      setSelected]      = useState<string | null>(null)
  const [mapReady,      setMapReady]      = useState(false)
  const [tab,           setTab]           = useState<Tab>('starred')
  const [yearFilter,    setYearFilter]    = useState<number | null>(null)
  const [listKey,       setListKey]       = useState(0)
  const [listFading,    setListFading]    = useState(false)

  // ── Map init ─────────────────────────────────────────────────────────────────
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

  // ── Place markers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !map.current) return

    // Starred markers
    MICHELIN.forEach(r => {
      const t = TIER[r.stars]
      const el = document.createElement('div')
      el.style.cssText = `width:${t.size}px; height:${t.size}px; position:relative; cursor:pointer;`

      const inner = document.createElement('div')
      inner.style.cssText = `
        width:100%; height:100%; border-radius:50%;
        background:${t.color};
        box-shadow:0 0 ${t.size / 2}px ${t.size / 4}px ${t.glow};
        display:flex; align-items:center; justify-content:center;
        font-size:${Math.round(t.size * 0.38)}px; color:#000; font-weight:900; font-family:serif;
        transition:transform 0.15s, box-shadow 0.15s;
      `
      inner.textContent = '★'.repeat(r.stars)
      inner.title = `${r.name} · ${r.stars}★`

      inner.addEventListener('mouseenter', () => {
        inner.style.transform = 'scale(1.4)'
        inner.style.boxShadow = `0 0 ${t.size}px ${t.size / 2}px ${t.glow}`
      })
      inner.addEventListener('mouseleave', () => {
        inner.style.transform = 'scale(1)'
        inner.style.boxShadow = `0 0 ${t.size / 2}px ${t.size / 4}px ${t.glow}`
      })
      el.addEventListener('click', () => flyTo(r.name, r.lat, r.lng, 'starred'))

      const pulse = document.createElement('div')
      pulse.style.cssText = `
        position:absolute; inset:-5px; border-radius:50%;
        border:2px solid ${t.glow};
        animation:markerPulse 1.4s ease-out both;
        pointer-events:none;
      `
      el.appendChild(inner)
      el.appendChild(pulse)

      starMarkers.current[r.name] = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([r.lng, r.lat])
        .addTo(map.current!)
    })

    // Bib Gourmand markers — smaller red dots
    BIB_GOURMAND.forEach(r => {
      const el = document.createElement('div')
      el.style.cssText = `width:12px; height:12px; position:relative; cursor:pointer;`

      const inner = document.createElement('div')
      inner.style.cssText = `
        width:100%; height:100%; border-radius:50%;
        background:${RED};
        box-shadow:0 0 6px 2px ${RED_G};
        transition:transform 0.15s;
      `
      inner.title = `${r.name} · Bib Gourmand`

      inner.addEventListener('mouseenter', () => { inner.style.transform = 'scale(1.5)' })
      inner.addEventListener('mouseleave', () => { inner.style.transform = 'scale(1)' })
      el.addEventListener('click', () => flyTo(r.name, r.lat, r.lng, 'bib'))

      el.appendChild(inner)

      bibMarkers.current[r.name] = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([r.lng, r.lat])
        .addTo(map.current!)
    })
  }, [mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  function flyTo(name: string, lat: number, lng: number, targetTab: Tab) {
    if (tab !== targetTab) {
      setTab(targetTab)
      setSelected(null)
    }
    map.current?.flyTo({ center: [lng, lat], zoom: 15.5, duration: 1000, essential: true })
    setSelected(name)
    setTimeout(() => rowRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150)
  }

  const handleYearFilter = (yr: number | null) => {
    setListFading(true)
    setTimeout(() => {
      setYearFilter(yr)
      setListKey(k => k + 1)
      setListFading(false)
    }, 160)
  }

  const handleTab = (t: Tab) => {
    setTab(t)
    setSelected(null)
    setYearFilter(null)
  }

  const filtered = yearFilter ? MICHELIN.filter(r => r.since === yearFilter) : MICHELIN
  const tiers    = ([3, 2, 1] as const)
    .map(s => ({ stars: s, items: filtered.filter(r => r.stars === s) }))
    .filter(t => t.items.length > 0)

  // ── Styles ──────────────────────────────────────────────────────────────────
  const C = {
    bg:       '#0d0d0d',
    panel:    '#111111',
    border:   'rgba(255,255,255,0.07)',
    text:     '#F0F0F0',
    muted:    'rgba(255,255,255,0.38)',
    faint:    'rgba(255,255,255,0.16)',
  }

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tenureGrow {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @keyframes markerPulse {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        .michelin-row:hover { background: rgba(255,255,255,0.03) !important; }
        .tab-btn { border: none; cursor: pointer; transition: all 0.15s; }
        .year-pill { border: none; cursor: pointer; transition: all 0.12s; }
        .year-pill:hover { opacity: 1 !important; }
      `}</style>

      <Head>
        <title>Michelin Guide Singapore — StorePulse</title>
        <meta name="description" content="Singapore Michelin starred restaurants and Bib Gourmand on the map." />
      </Head>

      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 48px)' }}>

          {/* ── Map ─────────────────────────────────────────────────────────── */}
          <div style={{ flex: '0 0 60%', position: 'relative', borderRight: `1px solid ${C.border}` }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {/* Map legend */}
            <div style={{
              position: 'absolute', bottom: 20, left: 16,
              background: 'rgba(13,13,13,0.92)', border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '12px 16px',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ fontSize: 9, color: C.faint, letterSpacing: 2, marginBottom: 10, fontFamily: 'monospace' }}>
                MICHELIN GUIDE SINGAPORE {GUIDE_START}–{GUIDE_END}
              </div>
              {([3, 2, 1] as const).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <div style={{
                    width: TIER[s].size, height: TIER[s].size, background: TIER[s].color,
                    borderRadius: '50%', boxShadow: `0 0 6px 2px ${TIER[s].glow}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: Math.round(TIER[s].size * 0.38), color: '#000', fontWeight: 900,
                    flexShrink: 0, fontFamily: 'serif',
                  }}>{'★'.repeat(s)}</div>
                  <div>
                    <span style={{ color: TIER[s].color, fontSize: 11, fontWeight: 600 }}>
                      {s === 3 ? '3 Stars' : s === 2 ? '2 Stars' : '1 Star'}
                    </span>
                    <span style={{ color: C.faint, fontSize: 10, marginLeft: 6 }}>
                      {MICHELIN.filter(r => r.stars === s).length}
                    </span>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                <div style={{ width: 12, height: 12, background: RED, borderRadius: '50%', boxShadow: `0 0 6px 2px ${RED_G}`, flexShrink: 0 }} />
                <div>
                  <span style={{ color: RED, fontSize: 11, fontWeight: 600 }}>Bib Gourmand</span>
                  <span style={{ color: C.faint, fontSize: 10, marginLeft: 6 }}>{BIB_GOURMAND.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Panel ───────────────────────────────────────────────────────── */}
          <div style={{ flex: '0 0 40%', background: C.panel, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '18px 20px 0', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: RED,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: '#fff', flexShrink: 0,
                }}>M</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
                    Michelin Guide Singapore
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {MICHELIN.length} starred · {BIB_GOURMAND.length} Bib Gourmand
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0 }}>
                {([
                  { id: 'starred' as Tab, label: '★ Starred', count: filtered.length },
                  { id: 'bib'     as Tab, label: '◎ Bib Gourmand', count: BIB_GOURMAND.length },
                ]).map(t => (
                  <button
                    key={t.id}
                    className="tab-btn"
                    onClick={() => handleTab(t.id)}
                    style={{
                      flex: 1, padding: '9px 0 11px',
                      background: 'transparent',
                      color: tab === t.id ? C.text : C.muted,
                      fontSize: 12, fontWeight: tab === t.id ? 700 : 400,
                      borderBottom: tab === t.id ? `2px solid ${t.id === 'starred' ? '#F0A500' : RED}` : '2px solid transparent',
                    }}
                  >
                    {t.label}
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 400,
                      color: tab === t.id ? C.muted : C.faint,
                    }}>
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Year filter — starred tab only */}
            {tab === 'starred' && (
              <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginRight: 4, fontFamily: 'monospace' }}>
                    VINTAGE
                  </span>
                  {[null, ...VINTAGE_YEARS].map(yr => {
                    const active = yr === yearFilter
                    return (
                      <button
                        key={yr ?? 'all'}
                        className="year-pill"
                        onClick={() => handleYearFilter(yr === yearFilter ? null : yr)}
                        style={{
                          padding: '3px 8px', borderRadius: 4,
                          background: active
                            ? 'rgba(240,165,0,0.15)'
                            : 'rgba(255,255,255,0.04)',
                          color: active ? '#F0A500' : C.muted,
                          fontSize: 10, fontWeight: active ? 700 : 400,
                          outline: active ? '1px solid rgba(240,165,0,0.4)' : '1px solid transparent',
                          opacity: active ? 1 : 0.8,
                        }}
                      >
                        {yr ?? 'All'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* List */}
            <div
              key={listKey}
              style={{
                flex: 1, overflowY: 'auto', paddingBottom: 32,
                transition: 'opacity 0.16s', opacity: listFading ? 0.25 : 1,
              }}
            >
              {tab === 'starred' && (
                <>
                  {tiers.map(({ stars, items }) => {
                    const t = TIER[stars]
                    return (
                      <div key={stars}>
                        {/* Tier header */}
                        <div style={{
                          padding: '10px 20px', position: 'sticky', top: 0, zIndex: 5,
                          background: C.panel, borderBottom: `1px solid ${C.border}`,
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <span style={{ color: t.color, fontSize: 13, fontFamily: 'serif' }}>
                            {'★'.repeat(stars)}
                          </span>
                          <div>
                            <span style={{ color: t.color, fontSize: 12, fontWeight: 700 }}>
                              {stars} Star{stars > 1 ? 's' : ''}
                            </span>
                            <span style={{ color: C.faint, fontSize: 10, marginLeft: 8 }}>
                              {t.label.split('—')[0].trim()}
                            </span>
                          </div>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: C.faint }}>
                            {items.length}
                          </span>
                        </div>

                        {/* Rows */}
                        {items.map((r, idx) => {
                          const isSel = selected === r.name
                          const upgradeYear = r.currentSince > r.since ? r.currentSince : undefined
                          return (
                            <div
                              key={r.name}
                              ref={el => { rowRefs.current[r.name] = el }}
                              className="michelin-row"
                              onClick={() => flyTo(r.name, r.lat, r.lng, 'starred')}
                              style={{
                                padding: '12px 20px',
                                borderBottom: `1px solid ${C.border}`,
                                borderLeft: isSel ? `3px solid ${t.color}` : '3px solid transparent',
                                background: isSel ? `${t.color}0d` : 'transparent',
                                cursor: 'pointer',
                                transition: 'background 0.12s, border-left-color 0.12s',
                                animation: 'fadeSlideIn 0.32s ease both',
                                animationDelay: `${idx * 35}ms`,
                              }}
                            >
                              {/* Name row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 9, color: C.faint, fontFamily: 'monospace', minWidth: 18 }}>
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                                <span style={{
                                  fontSize: 13, fontWeight: 700, flex: 1, color: isSel ? t.color : C.text,
                                  transition: 'color 0.12s',
                                }}>
                                  {r.name}
                                </span>
                                <span style={{
                                  fontSize: 9, color: t.color, fontFamily: 'monospace',
                                  background: `${t.color}14`, padding: '2px 6px', borderRadius: 3,
                                  border: `1px solid ${t.color}30`, flexShrink: 0,
                                }}>
                                  {r.since}
                                </span>
                              </div>

                              {/* Meta row */}
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 26, marginBottom: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, color: C.muted }}>{r.cuisine}</span>
                                <span style={{ color: C.faint, fontSize: 9 }}>·</span>
                                <span style={{ fontSize: 10, color: C.faint }}>{r.chef}</span>
                                <span style={{ color: C.faint, fontSize: 9 }}>·</span>
                                <span style={{ fontSize: 10, color: C.faint }}>{r.mrt} MRT</span>
                                <span style={{ fontSize: 10, color: '#C8A951', letterSpacing: 0.5 }}>{r.priceSGD}</span>
                              </div>

                              {/* Tenure bar */}
                              <div style={{ paddingLeft: 26 }}>
                                <TenureBar since={r.since} color={t.color} upgradeYear={upgradeYear} />
                              </div>

                              {/* Star ascension */}
                              {r.history && (
                                <div style={{ paddingLeft: 26, marginTop: 5 }}>
                                  <span style={{ fontSize: 9, color: 'rgba(255,215,0,0.45)', letterSpacing: 0.3 }}>
                                    ↑ {r.history}
                                  </span>
                                </div>
                              )}

                              {/* Expanded note */}
                              {isSel && (
                                <div style={{
                                  marginTop: 10, paddingLeft: 26, paddingTop: 8,
                                  borderTop: `1px solid ${t.color}18`,
                                  fontSize: 11, color: C.muted, lineHeight: 1.6,
                                }}>
                                  {r.note}
                                  <div style={{ marginTop: 5, fontSize: 10, color: C.faint }}>
                                    {r.address} · {r.district.replace('_', ' ')}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {filtered.length === 0 && (
                    <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 12, color: C.faint }}>
                      No starred restaurants in {yearFilter}
                    </div>
                  )}
                </>
              )}

              {tab === 'bib' && (
                <div>
                  {/* Bib header */}
                  <div style={{
                    padding: '10px 20px', position: 'sticky', top: 0, zIndex: 5,
                    background: C.panel, borderBottom: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: RED, flexShrink: 0 }} />
                    <span style={{ color: RED, fontSize: 12, fontWeight: 700 }}>Bib Gourmand</span>
                    <span style={{ color: C.faint, fontSize: 10 }}>Good quality, good value</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: C.faint }}>{BIB_GOURMAND.length}</span>
                  </div>

                  {BIB_GOURMAND.map((r, idx) => {
                    const isSel = selected === r.name
                    return (
                      <div
                        key={r.name}
                        ref={el => { rowRefs.current[r.name] = el }}
                        className="michelin-row"
                        onClick={() => flyTo(r.name, r.lat, r.lng, 'bib')}
                        style={{
                          padding: '12px 20px',
                          borderBottom: `1px solid ${C.border}`,
                          borderLeft: isSel ? `3px solid ${RED}` : '3px solid transparent',
                          background: isSel ? 'rgba(228,0,43,0.07)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.12s, border-left-color 0.12s',
                          animation: 'fadeSlideIn 0.32s ease both',
                          animationDelay: `${idx * 30}ms`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: C.faint, fontFamily: 'monospace', minWidth: 18 }}>
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: isSel ? RED : C.text, transition: 'color 0.12s' }}>
                            {r.name}
                          </span>
                          <span style={{
                            fontSize: 9, color: RED, fontFamily: 'monospace',
                            background: 'rgba(228,0,43,0.1)', padding: '2px 6px', borderRadius: 3,
                            border: '1px solid rgba(228,0,43,0.25)', flexShrink: 0,
                          }}>
                            {r.since}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 26, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: C.muted }}>{r.cuisine}</span>
                          <span style={{ color: C.faint, fontSize: 9 }}>·</span>
                          <span style={{ fontSize: 10, color: C.faint }}>{r.mrt} MRT</span>
                          <span style={{ fontSize: 10, color: C.faint }}>· {r.district.replace('_', ' ')}</span>
                        </div>

                        <div style={{ paddingLeft: 26 }}>
                          <TenureBar since={r.since} color={RED} />
                        </div>

                        {isSel && (
                          <div style={{
                            marginTop: 10, paddingLeft: 26, paddingTop: 8,
                            borderTop: 'rgba(228,0,43,0.15) 1px solid',
                            fontSize: 11, color: C.muted, lineHeight: 1.6,
                          }}>
                            {r.note}
                            <div style={{ marginTop: 5, fontSize: 10, color: C.faint }}>{r.address}</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Footer */}
              <div style={{ padding: '20px 20px 8px', fontSize: 9, color: C.faint, fontFamily: 'monospace', letterSpacing: 1, lineHeight: 2 }}>
                <div>SOURCE: MICHELIN GUIDE SINGAPORE {GUIDE_START}–{GUIDE_END}</div>
                <div>CLICK ANY RESTAURANT TO FLY TO ITS LOCATION</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
