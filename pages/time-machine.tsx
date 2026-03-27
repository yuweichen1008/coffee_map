import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Navbar from '@/components/Navbar'
import { supabase } from '../lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

const YEAR_MIN = 2010
const YEAR_MAX = new Date().getFullYear()
const PLAY_INTERVAL_MS = 900

const CATEGORY_COLORS: Record<string, string> = {
  cafe:               '#ea580c',
  convenience_store:  '#2563eb',
  grocery:            '#16a34a',
  restaurant:         '#9333ea',
  bakery:             '#d97706',
  beverage_store:     '#0891b2',
}
const DEFAULT_COLOR = '#6b7280'

type PlaceFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { name: string; address: string; founded_year: number | null; category: string }
}

export default function TimeMachine() {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const map          = useRef<mapboxgl.Map | null>(null)
  const playTimer    = useRef<ReturnType<typeof setInterval> | null>(null)

  const [session,  setSession]  = useState<Session | null>(null)
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [category, setCategory] = useState('cafe')
  const [categories, setCategories] = useState<string[]>([])
  const [selectedYear, setSelectedYear] = useState(YEAR_MAX)
  const [isPlaying, setIsPlaying] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [totalWithDate, setTotalWithDate] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
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

  // ── Categories ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(j => setCategories(j.categories || []))
      .catch(() => setCategories(['cafe', 'grocery store', 'beverage store']))
  }, [])

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
      setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN')
      return
    }
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [121.5654, 25.033],
      zoom: 12,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
  }, [])

  // ── Load places into Mapbox GeoJSON source ────────────────────────────────
  const loadCategory = useCallback(async (cat: string) => {
    if (!map.current) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/supabase/places?category=${encodeURIComponent(cat)}`)
      const json = await res.json()
      const places: any[] = json.results || []

      const features: PlaceFeature[] = places
        .filter(p => p.lat != null && p.lng != null)
        .map(p => {
          const fyear = p.founded_date ? new Date(p.founded_date).getFullYear() : null
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {
              name:         p.name,
              address:      p.address || '',
              founded_year: fyear,
              category:     p.category,
            },
          }
        })

      const withDate = features.filter(f => f.properties.founded_year != null)
      setTotalWithDate(withDate.length)

      const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

      const waitForStyle = () =>
        new Promise<void>(resolve => {
          if (map.current!.isStyleLoaded()) resolve()
          else map.current!.once('styledata', () => resolve())
        })

      await waitForStyle()

      // Remove previous source/layers if they exist
      if (map.current.getLayer('places-circles')) map.current.removeLayer('places-circles')
      if (map.current.getLayer('places-heat'))    map.current.removeLayer('places-heat')
      if (map.current.getSource('places'))        map.current.removeSource('places')

      const color = CATEGORY_COLORS[cat] ?? DEFAULT_COLOR

      map.current.addSource('places', { type: 'geojson', data: geojson })

      // Heatmap layer (below circles)
      map.current.addLayer({
        id: 'places-heat',
        type: 'heatmap',
        source: 'places',
        maxzoom: 15,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 15, 1.5],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.2, `${color}44`,
            0.6, `${color}99`,
            1,   color,
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 15, 24],
          'heatmap-opacity': 0.7,
        },
      })

      // Circle layer
      map.current.addLayer({
        id: 'places-circles',
        type: 'circle',
        source: 'places',
        minzoom: 13,
        paint: {
          'circle-radius': 6,
          'circle-color': color,
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      })

      // Popup on click
      map.current.on('click', 'places-circles', (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        const yearLabel = props.founded_year ? `Est. ${props.founded_year}` : 'Est. unknown'
        new mapboxgl.Popup({ offset: 10 })
          .setLngLat((e.features![0].geometry as any).coordinates)
          .setHTML(`<strong>${props.name}</strong><br/><span style="font-size:12px">${props.address}</span><br/><span style="font-size:11px;color:#888">${yearLabel}</span>`)
          .addTo(map.current!)
      })
      map.current.on('mouseenter', 'places-circles', () => { map.current!.getCanvas().style.cursor = 'pointer' })
      map.current.on('mouseleave', 'places-circles', () => { map.current!.getCanvas().style.cursor = '' })

      // Apply current year filter
      applyYearFilter(selectedYear, features.length)
    } catch (e) {
      setError('Failed to load places: ' + String(e))
    } finally {
      setLoading(false)
    }
  }, [selectedYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply year filter to existing source ─────────────────────────────────
  const applyYearFilter = useCallback((year: number, total?: number) => {
    if (!map.current) return

    // Show places where founded_year <= year, OR founded_year is null (unknown)
    const filter: mapboxgl.FilterSpecification = [
      'any',
      ['!', ['has', 'founded_year']],          // no date = always visible
      ['==', ['get', 'founded_year'], null],
      ['<=', ['get', 'founded_year'], year],
    ]

    if (map.current.getLayer('places-circles')) map.current.setFilter('places-circles', filter)
    if (map.current.getLayer('places-heat'))    map.current.setFilter('places-heat',    filter)

    // Count visible features (those with a date that fits the filter)
    const source = map.current.getSource('places') as mapboxgl.GeoJSONSource | undefined
    if (!source) return

    // Count via querying rendered features
    const rendered = map.current.querySourceFeatures('places', { filter })
    // querySourceFeatures may return duplicates across tiles — deduplicate by coordinates
    const seen = new Set<string>()
    let count = 0
    for (const f of rendered) {
      const key = (f.geometry as any).coordinates?.join(',')
      if (key && !seen.has(key)) { seen.add(key); count++ }
    }
    setVisibleCount(count)
  }, [])

  // Reload when category changes
  useEffect(() => {
    loadCategory(category)
  }, [category]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply filter whenever year changes (no reload needed)
  useEffect(() => {
    applyYearFilter(selectedYear)
  }, [selectedYear, applyYearFilter])

  // ── Play / pause ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      playTimer.current = setInterval(() => {
        setSelectedYear(y => {
          if (y >= YEAR_MAX) {
            setIsPlaying(false)
            return YEAR_MAX
          }
          return y + 1
        })
      }, PLAY_INTERVAL_MS)
    } else {
      if (playTimer.current) clearInterval(playTimer.current)
    }
    return () => { if (playTimer.current) clearInterval(playTimer.current) }
  }, [isPlaying])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false)
    setSelectedYear(Number(e.target.value))
  }

  const togglePlay = () => {
    if (selectedYear >= YEAR_MAX) setSelectedYear(YEAR_MIN)
    setIsPlaying(p => !p)
  }

  return (
    <>
      <Navbar isAdmin={isAdmin} userEmail={session?.user?.email} />

      <div className="relative" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Map */}
        <div ref={mapContainer} className="w-full h-full" />

        {/* Year badge — top left */}
        <div className="absolute top-4 left-4 bg-black/70 text-white rounded-xl px-5 py-3 backdrop-blur-sm pointer-events-none">
          <div className="text-5xl font-black tracking-tight leading-none">{selectedYear}</div>
          <div className="text-sm text-gray-300 mt-1">
            {loading ? 'Loading…' : `${visibleCount} stores visible`}
          </div>
          {totalWithDate > 0 && (
            <div className="text-xs text-gray-500 mt-0.5">{totalWithDate} with known date</div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm">
            Loading {category} data…
          </div>
        )}

        {/* Bottom control bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm text-white px-6 py-4">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">

            {/* Category tabs */}
            <div className="flex gap-2 flex-wrap">
              {(categories.length ? categories : ['cafe']).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    category === cat
                      ? 'bg-white text-black'
                      : 'bg-white/10 hover:bg-white/20 text-gray-300'
                  }`}
                >
                  {cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {/* Slider row */}
            <div className="flex items-center gap-4">
              {/* Play/pause */}
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition flex-shrink-0"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  // Pause icon
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  // Play icon
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Year labels */}
              <span className="text-xs text-gray-400 flex-shrink-0">{YEAR_MIN}</span>

              {/* Slider */}
              <input
                type="range"
                min={YEAR_MIN}
                max={YEAR_MAX}
                step={1}
                value={selectedYear}
                onChange={handleSliderChange}
                className="flex-1 accent-white h-1.5 cursor-pointer"
              />

              <span className="text-xs text-gray-400 flex-shrink-0">{YEAR_MAX}</span>

              {/* Reset */}
              <button
                onClick={() => { setIsPlaying(false); setSelectedYear(YEAR_MAX) }}
                className="text-xs text-gray-400 hover:text-white transition flex-shrink-0"
              >
                Reset
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Showing stores established on or before <span className="text-gray-300">{selectedYear}</span>.
              Stores without a known founding date are always shown.
              Run <code className="bg-white/10 px-1 rounded">update_founded_dates.py</code> to enrich more data.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
