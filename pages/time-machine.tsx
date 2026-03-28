import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Navbar from '@/components/Navbar'
import { supabase } from '../lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

const PLAY_INTERVAL_MS  = 800
const FALLBACK_CATS     = ['cafe', 'convenience_store', 'restaurant', 'bakery', 'beverage_store']

// Category accent colors (tabs only)
const CATEGORY_COLORS: Record<string, string> = {
  cafe:               '#f97316',
  convenience_store:  '#3b82f6',
  grocery:            '#22c55e',
  restaurant:         '#a855f7',
  bakery:             '#f59e0b',
  beverage_store:     '#06b6d4',
}
const DEFAULT_ACCENT = '#94a3b8'

// Map color scheme
const COLD_COLOR = '#3b82f6'   // blue  — established / saturated zone
const HOT_COLOR  = '#ef4444'   // red   — recently opened / growing
const MID_COLOR  = '#a78bfa'   // purple — midpoint transition

// Dead-zone colors — dark / ominous
const DEAD_COLOR_HEAT = '#7f1d1d'   // deep red-brown for dead-zone heatmap

type PlaceFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    name:         string
    address:      string
    founded_year: number | null
    closed_year:  number | null
    status:       string
    category:     string
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.max(0, Math.floor(sorted.length * p) - 1)
  return sorted[idx]
}

// Layer IDs managed by this component
const LAYER_IDS = [
  'places-pop', 'places-pop-glow',
  'places-circles',
  'places-heat-new', 'places-heat-all',
  'places-dead-symbol', 'places-dead-circles', 'places-dead-heat',
] as const

export default function TimeMachine() {
  const mapContainer   = useRef<HTMLDivElement | null>(null)
  const map            = useRef<mapboxgl.Map | null>(null)
  const playTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  const allFeaturesRef = useRef<PlaceFeature[]>([])

  const [session,       setSession]       = useState<Session | null>(null)
  const [isAdmin,       setIsAdmin]       = useState(false)
  const [category,      setCategory]      = useState('cafe')
  const [categories,    setCategories]    = useState<string[]>([])
  const [yearMin,       setYearMin]       = useState(2010)
  const [yearMax,       setYearMax]       = useState(new Date().getFullYear())
  const [selectedYear,  setSelectedYear]  = useState(new Date().getFullYear())
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [visibleCount,  setVisibleCount]  = useState(0)
  const [deadCount,     setDeadCount]     = useState(0)
  const [totalLoaded,   setTotalLoaded]   = useState(0)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [yearDist,      setYearDist]      = useState<Record<number, number>>({})
  const [showDeadZones, setShowDeadZones] = useState(true)

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsAdmin(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setIsAdmin(s?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Categories ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(j => setCategories(j.categories?.length ? j.categories : FALLBACK_CATS))
      .catch(() => setCategories(FALLBACK_CATS))
  }, [])

  // ── Map init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) { setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN'); return }
    map.current = new mapboxgl.Map({
      container:   mapContainer.current,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      style:       'mapbox://styles/mapbox/dark-v11',
      center:      [121.5654, 25.033],
      zoom:        12,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
  }, [])

  // ── Count helpers ─────────────────────────────────────────────────────────────
  const countActive = useCallback((year: number) =>
    allFeaturesRef.current.filter(f => {
      const fy = f.properties.founded_year
      const cy = f.properties.closed_year
      const foundedOk = fy == null || fy <= year
      const notDead   = f.properties.status !== 'closed' || cy == null || cy > year
      return foundedOk && notDead
    }).length
  , [])

  const countDead = useCallback((year: number) =>
    allFeaturesRef.current.filter(f => {
      const cy = f.properties.closed_year
      return f.properties.status === 'closed' && cy != null && cy <= year
    }).length
  , [])

  // ── Apply year filter to all map layers ───────────────────────────────────────
  const applyYearFilter = useCallback((year: number, deadVisible: boolean) => {
    if (!map.current) return

    // Active stores: founded ≤ year AND not yet closed
    const activeFilter: mapboxgl.FilterSpecification = [
      'all',
      ['any',
        ['!', ['has', 'founded_year']],
        ['==', ['get', 'founded_year'], null],
        ['<=', ['get', 'founded_year'], year],
      ],
      ['any',
        ['!=', ['get', 'status'], 'closed'],
        ['==', ['get', 'closed_year'], null],
        ['>', ['get', 'closed_year'], year],
      ],
    ]

    // Pop ring: active stores that opened exactly this year
    const newThisYear: mapboxgl.FilterSpecification = [
      'all',
      ['==', ['get', 'founded_year'], year],
      ['any',
        ['!=', ['get', 'status'], 'closed'],
        ['==', ['get', 'closed_year'], null],
        ['>', ['get', 'closed_year'], year],
      ],
    ]

    // Recent growth heatmap: opened in last 3 years and still active
    const recentActive: mapboxgl.FilterSpecification = [
      'all',
      ['>=', ['get', 'founded_year'], year - 2],
      ['<=', ['get', 'founded_year'], year],
      ['any',
        ['!=', ['get', 'status'], 'closed'],
        ['==', ['get', 'closed_year'], null],
        ['>', ['get', 'closed_year'], year],
      ],
    ]

    // Dead stores: permanently closed on or before selected year
    const deadFilter: mapboxgl.FilterSpecification = [
      'all',
      ['==', ['get', 'status'], 'closed'],
      ['!=', ['get', 'closed_year'], null],
      ['<=', ['get', 'closed_year'], year],
    ]

    // Apply active filters
    if (map.current.getLayer('places-heat-all'))   map.current.setFilter('places-heat-all',  activeFilter)
    if (map.current.getLayer('places-heat-new'))   map.current.setFilter('places-heat-new',  recentActive)
    if (map.current.getLayer('places-circles'))    map.current.setFilter('places-circles',   activeFilter)
    if (map.current.getLayer('places-pop-glow'))   map.current.setFilter('places-pop-glow',  newThisYear)
    if (map.current.getLayer('places-pop'))        map.current.setFilter('places-pop',       newThisYear)

    // Apply dead-zone filters + visibility toggle
    const deadVis = deadVisible ? 'visible' : 'none'
    if (map.current.getLayer('places-dead-heat')) {
      map.current.setFilter('places-dead-heat', deadFilter)
      map.current.setLayoutProperty('places-dead-heat', 'visibility', deadVis)
    }
    for (const id of ['places-dead-circles', 'places-dead-symbol'] as const) {
      if (map.current.getLayer(id)) {
        map.current.setFilter(id, deadFilter)
        map.current.setLayoutProperty(id, 'visibility', deadVis)
      }
    }

    setVisibleCount(countActive(year))
    setDeadCount(countDead(year))
  }, [countActive, countDead])

  // ── Load category data ────────────────────────────────────────────────────────
  const loadCategory = useCallback(async (cat: string) => {
    if (!map.current) return
    setLoading(true)
    setError(null)

    try {
      // Fetch ALL places (active + closed) so dead-zone layer has its data
      const res  = await fetch(
        `/api/supabase/places?category=${encodeURIComponent(cat)}&include_closed=true`,
      )
      const json = await res.json()
      const rows: any[] = json.results || []

      const features: PlaceFeature[] = rows
        .filter(p => p.lat != null && p.lng != null)
        .map(p => ({
          type:     'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: {
            name:         p.name,
            address:      p.address || '',
            founded_year: p.founded_date ? new Date(p.founded_date).getFullYear() : null,
            closed_year:  p.closed_date  ? new Date(p.closed_date).getFullYear()  : null,
            status:       p.status || 'active',
            category:     p.category,
          },
        }))

      allFeaturesRef.current = features
      setTotalLoaded(features.length)

      // ── Dynamic year range (10th pct → max) from active stores only ─────────
      const activeYears = features
        .filter(f => f.properties.status !== 'closed')
        .map(f => f.properties.founded_year)
        .filter((y): y is number => y != null)
        .sort((a, b) => a - b)

      const dataYearMin = activeYears.length > 0 ? percentile(activeYears, 0.1) : new Date().getFullYear() - 10
      const dataYearMax = activeYears.length > 0 ? activeYears[activeYears.length - 1] : new Date().getFullYear()

      setYearMin(dataYearMin)
      setYearMax(dataYearMax)
      setSelectedYear(dataYearMax)

      // ── Year distribution histogram (active stores only) ──────────────────────
      const dist: Record<number, number> = {}
      features.forEach(f => {
        if (f.properties.status !== 'closed' && f.properties.founded_year != null) {
          const y = f.properties.founded_year
          dist[y] = (dist[y] || 0) + 1
        }
      })
      setYearDist(dist)

      // ── Wait for map style ────────────────────────────────────────────────────
      await new Promise<void>(resolve => {
        if (map.current!.isStyleLoaded()) resolve()
        else map.current!.once('styledata', () => resolve())
      })

      // Remove old layers / source
      for (const id of LAYER_IDS) {
        if (map.current.getLayer(id)) map.current.removeLayer(id)
      }
      if (map.current.getSource('places')) map.current.removeSource('places')

      const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
      map.current.addSource('places', { type: 'geojson', data: geojson })

      const yrSpan = Math.max(1, dataYearMax - dataYearMin)

      // ══ Layer 1: Cold-blue heatmap — established / saturated zones ════════════
      map.current.addLayer({
        id: 'places-heat-all', type: 'heatmap', source: 'places',
        maxzoom: 16,
        paint: {
          'heatmap-weight':    1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 16, 2],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.15, 'rgba(96,165,250,0.25)',
            0.4,  'rgba(59,130,246,0.55)',
            0.75, 'rgba(29,78,216,0.75)',
            1,    '#1e3a8a',
          ],
          'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 0, 16, 16, 40],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.9, 15, 0.4],
        },
      })

      // ══ Layer 2: Warm-red heatmap — recent growth (last 3 years) ═════════════
      map.current.addLayer({
        id: 'places-heat-new', type: 'heatmap', source: 'places',
        maxzoom: 16,
        paint: {
          'heatmap-weight':    1.5,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 16, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.1, 'rgba(251,146,60,0.3)',
            0.4, 'rgba(239,68,68,0.6)',
            0.8, 'rgba(185,28,28,0.85)',
            1,   '#7f1d1d',
          ],
          'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 0, 20, 16, 50],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 15, 0.35],
        },
      })

      // ══ Layer 3: Dead-zone heatmap — ghost of failed businesses ══════════════
      map.current.addLayer({
        id: 'places-dead-heat', type: 'heatmap', source: 'places',
        filter: ['==', false, true],   // populated by applyYearFilter
        maxzoom: 16,
        layout: { visibility: showDeadZones ? 'visible' : 'none' },
        paint: {
          'heatmap-weight':    2,       // closed stores weighted higher = danger signal
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 16, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.1,  'rgba(127,29,29,0.2)',
            0.35, 'rgba(127,29,29,0.5)',
            0.7,  'rgba(109,7,7,0.75)',
            1,    '#450a0a',
          ],
          'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 0, 22, 16, 55],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.85, 15, 0.45],
        },
      })

      // ══ Layer 4: Active circles — cold→warm by founding year ═════════════════
      map.current.addLayer({
        id: 'places-circles', type: 'circle', source: 'places',
        minzoom: 10,
        filter: ['==', false, true],   // populated by applyYearFilter
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 7],
          'circle-color': [
            'case',
            ['!', ['has', 'founded_year']], '#6b7280',
            ['==', ['get', 'founded_year'], null], '#6b7280',
            ['interpolate', ['linear'], ['get', 'founded_year'],
              dataYearMin,                 COLD_COLOR,
              dataYearMin + yrSpan * 0.5,  MID_COLOR,
              dataYearMax,                 HOT_COLOR,
            ],
          ],
          'circle-opacity':      0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(0,0,0,0.4)',
        },
      })

      // ══ Layer 5a: Dead-zone background circle (dark base for the symbol) ════════
      map.current.addLayer({
        id: 'places-dead-circles', type: 'circle', source: 'places',
        minzoom: 11,
        filter: ['==', false, true],
        layout: { visibility: showDeadZones ? 'visible' : 'none' },
        paint: {
          'circle-radius':         ['interpolate', ['linear'], ['zoom'], 11, 9, 15, 15],
          'circle-color':          '#111827',
          'circle-opacity':        0.75,
          'circle-stroke-width':   1.5,
          'circle-stroke-color':   '#ef4444',
          'circle-stroke-opacity': 0.6,
        },
      })

      // ══ Layer 5b: Dead-zone skull ☠ symbol ════════════════════════════════════
      map.current.addLayer({
        id: 'places-dead-symbol', type: 'symbol', source: 'places',
        minzoom: 11,
        filter: ['==', false, true],
        layout: {
          visibility:              showDeadZones ? 'visible' : 'none',
          'text-field':            '☠',
          'text-size':             ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 16],
          'text-font':             ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-allow-overlap':    true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color':   '#fca5a5',
          'text-opacity': 0.95,
        },
      })

      // ══ Layer 6: Pop glow — aura for stores opening this year ════════════════
      map.current.addLayer({
        id: 'places-pop-glow', type: 'circle', source: 'places',
        filter: ['==', false, true],
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 24],
          'circle-color':   HOT_COLOR,
          'circle-opacity': 0.25,
          'circle-blur':    0.7,
        },
      })

      // ══ Layer 7: Pop dot — bright marker for stores opening this year ═════════
      map.current.addLayer({
        id: 'places-pop', type: 'circle', source: 'places',
        filter: ['==', false, true],
        paint: {
          'circle-radius':       ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 10],
          'circle-color':        '#ffffff',
          'circle-opacity':      1,
          'circle-stroke-width': 3,
          'circle-stroke-color': HOT_COLOR,
        },
      })

      // ── Popups ────────────────────────────────────────────────────────────────
      type MapClickEvent = mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] }

      const showActivePopup = (e: MapClickEvent) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        const coords  = (e.features![0].geometry as any).coordinates
        const isBrand = props.founded_year === dataYearMax
        const yearTxt = props.founded_year
          ? `${isBrand ? '🆕 Opened ' : 'Est. '}${props.founded_year}`
          : 'Est. unknown'
        new mapboxgl.Popup({ offset: 12 })
          .setLngLat(coords)
          .setHTML(
            `<strong>${props.name}</strong><br/>` +
            `<span style="font-size:12px">${props.address}</span><br/>` +
            `<span style="font-size:11px;color:#aaa">${yearTxt}</span>`,
          )
          .addTo(map.current!)
      }

      const showDeadPopup = (e: MapClickEvent) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        const coords   = (e.features![0].geometry as any).coordinates
        const foundTxt = props.founded_year ? `Est. ${props.founded_year}` : 'Est. unknown'
        const closeTxt = props.closed_year  ? `Closed ${props.closed_year}` : 'Closed'
        new mapboxgl.Popup({ offset: 12 })
          .setLngLat(coords)
          .setHTML(
            `<strong style="color:#9ca3af">${props.name}</strong> ` +
            `<span style="font-size:10px;color:#6b7280">CLOSED</span><br/>` +
            `<span style="font-size:12px;color:#6b7280">${props.address}</span><br/>` +
            `<span style="font-size:11px;color:#ef4444">⚠️ ${closeTxt}</span>` +
            (props.founded_year ? `<span style="font-size:11px;color:#6b7280"> · ${foundTxt}</span>` : ''),
          )
          .addTo(map.current!)
      }

      for (const layerId of ['places-circles', 'places-pop'] as const) {
        map.current.on('click',      layerId, showActivePopup)
        map.current.on('mouseenter', layerId, () => { map.current!.getCanvas().style.cursor = 'pointer' })
        map.current.on('mouseleave', layerId, () => { map.current!.getCanvas().style.cursor = '' })
      }
      // Dead-zone symbol is the clickable layer; circle is purely visual
      map.current.on('click',      'places-dead-symbol', showDeadPopup)
      map.current.on('mouseenter', 'places-dead-symbol', () => { map.current!.getCanvas().style.cursor = 'not-allowed' })
      map.current.on('mouseleave', 'places-dead-symbol', () => { map.current!.getCanvas().style.cursor = '' })

      applyYearFilter(dataYearMax, showDeadZones)
    } catch (e) {
      setError('Failed to load: ' + String(e))
    } finally {
      setLoading(false)
    }
  }, [applyYearFilter, showDeadZones])

  // ── Reload on category change ─────────────────────────────────────────────────
  useEffect(() => {
    loadCategory(category)
  }, [category]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply filter on year or dead-zone toggle change ───────────────────────────
  useEffect(() => {
    applyYearFilter(selectedYear, showDeadZones)
  }, [selectedYear, showDeadZones, applyYearFilter])

  // ── Play / pause ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      playTimer.current = setInterval(() => {
        setSelectedYear(y => {
          if (y >= yearMax) { setIsPlaying(false); return yearMax }
          return y + 1
        })
      }, PLAY_INTERVAL_MS)
    } else {
      if (playTimer.current) clearInterval(playTimer.current)
    }
    return () => { if (playTimer.current) clearInterval(playTimer.current) }
  }, [isPlaying, yearMax])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false)
    setSelectedYear(Number(e.target.value))
  }

  const togglePlay = () => {
    if (selectedYear >= yearMax) setSelectedYear(yearMin)
    setIsPlaying(p => !p)
  }

  // ── Histogram helpers ──────────────────────────────────────────────────────────
  const histYears   = Array.from({ length: Math.max(0, yearMax - yearMin + 1) }, (_, i) => yearMin + i)
  const maxBarCount = Math.max(1, ...Object.values(yearDist))
  const accent      = CATEGORY_COLORS[category] ?? DEFAULT_ACCENT
  const yearProgress = yearMax > yearMin ? (selectedYear - yearMin) / (yearMax - yearMin) : 1

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar isAdmin={isAdmin} userEmail={session?.user?.email} />

      <div className="relative" style={{ height: 'calc(100vh - 64px)' }}>
        <div ref={mapContainer} className="w-full h-full" />

        {/* ── Year badge ── */}
        <div className="absolute top-4 left-4 bg-black/80 text-white rounded-2xl px-5 py-4 backdrop-blur-sm pointer-events-none select-none">
          <div className="text-6xl font-black tracking-tighter leading-none tabular-nums">{selectedYear}</div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold" style={{ color: accent }}>{visibleCount}</span>
            <span className="text-sm text-gray-400">
              {category.replace(/_/g, ' ')} {visibleCount === 1 ? 'store' : 'stores'}
            </span>
          </div>

          {(yearDist[selectedYear] ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: HOT_COLOR }} />
              <span className="text-xs font-semibold" style={{ color: HOT_COLOR }}>
                +{yearDist[selectedYear]} opened this year
              </span>
            </div>
          )}

          {showDeadZones && deadCount > 0 && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-600" />
              <span className="text-xs font-semibold text-gray-500">
                {deadCount} dead zone{deadCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {totalLoaded > 0 && (
            <div className="text-xs text-gray-600 mt-1">{totalLoaded} total loaded</div>
          )}
        </div>

        {/* ── Legend ── */}
        <div className="absolute top-4 right-14 bg-black/75 text-white rounded-xl px-4 py-3 backdrop-blur-sm pointer-events-none select-none space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLD_COLOR }} />
            <span className="text-gray-300">Established zone</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: HOT_COLOR }} />
            <span className="text-gray-300">Recent growth</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 bg-white inline-block" style={{ borderColor: HOT_COLOR }} />
            <span className="text-gray-300">New this year</span>
          </div>
          {showDeadZones && (
            <>
              <div className="border-t border-white/10 my-1" />
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full inline-block bg-gray-600 opacity-60" />
                <span className="text-gray-400">Dead zone (⚠️ avoid)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: DEAD_COLOR_HEAT, opacity: 0.8 }} />
                <span className="text-gray-400">High failure density</span>
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/75 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading {category.replace(/_/g, ' ')}…
          </div>
        )}

        {/* ── Bottom control bar ── */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/90 backdrop-blur-sm text-white px-6 pt-3 pb-4">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">

            {/* Row: category tabs + dead-zone toggle */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {(categories.length ? categories : FALLBACK_CATS).map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setIsPlaying(false); setCategory(cat) }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                      category === cat ? 'text-black shadow-sm' : 'bg-white/10 hover:bg-white/20 text-gray-300'
                    }`}
                    style={category === cat ? { backgroundColor: CATEGORY_COLORS[cat] ?? DEFAULT_ACCENT } : undefined}
                  >
                    {cat.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              {/* Dead zone toggle */}
              <button
                onClick={() => setShowDeadZones(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  showDeadZones
                    ? 'bg-red-950/80 border-red-800 text-red-300'
                    : 'bg-white/5 border-white/20 text-gray-500 hover:text-gray-300'
                }`}
                title="Toggle dead zones — areas with high business failure rates"
              >
                <span>⚠️</span>
                <span>Dead Zones {showDeadZones ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Histogram — colored by recency */}
            <div className="flex items-end gap-px h-8" aria-hidden>
              {histYears.map(y => {
                const count     = yearDist[y] || 0
                const heightPct = count > 0 ? Math.max(10, Math.round((count / maxBarCount) * 100)) : 2
                const isPast    = y <= selectedYear
                const t         = histYears.length > 1 ? (y - yearMin) / (yearMax - yearMin) : 1
                const barColor  = isPast
                  ? `color-mix(in srgb, ${HOT_COLOR} ${Math.round(t * 100)}%, ${COLD_COLOR})`
                  : '#ffffff22'
                return (
                  <div
                    key={y}
                    title={count > 0 ? `${y}: ${count} opened` : String(y)}
                    className="flex-1 rounded-sm transition-all duration-150 cursor-pointer"
                    style={{
                      height:          `${heightPct}%`,
                      backgroundColor: barColor,
                      opacity:         count === 0 ? 0.3 : 1,
                    }}
                    onClick={() => { setIsPlaying(false); setSelectedYear(y) }}
                  />
                )
              })}
            </div>

            {/* Slider row */}
            <div className="flex items-center gap-4 -mt-1">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition flex-shrink-0"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">{yearMin}</span>

              <input
                type="range"
                min={yearMin}
                max={yearMax}
                step={1}
                value={selectedYear}
                onChange={handleSliderChange}
                className="flex-1 cursor-pointer"
                style={{
                  accentColor: yearProgress < 0.5
                    ? `color-mix(in srgb, ${MID_COLOR} ${Math.round(yearProgress * 200)}%, ${COLD_COLOR})`
                    : `color-mix(in srgb, ${HOT_COLOR} ${Math.round((yearProgress - 0.5) * 200)}%, ${MID_COLOR})`,
                }}
              />

              <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">{yearMax}</span>

              <button
                onClick={() => { setIsPlaying(false); setSelectedYear(yearMax) }}
                className="text-xs text-gray-500 hover:text-gray-200 transition flex-shrink-0"
              >
                Reset
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
