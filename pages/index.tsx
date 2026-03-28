import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '../lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import ErrorBanner from '../components/Error'

// ── Taipei district nav shortcuts ─────────────────────────────────────────────
const DISTRICTS: Record<string, [number, number]> = {
  "Da'an":    [121.543,   25.026   ],
  Xinyi:      [121.5677,  25.0348  ],
  Zhongshan:  [121.5254,  25.0550  ],
  Wanhua:     [121.4970,  25.0263  ],
  Datong:     [121.511,   25.063   ],
  Zhongzheng: [121.5183,  25.0324  ],
  Songshan:   [121.554,   25.055   ],
  Neihu:      [121.5833,  25.0667  ],
  Wenshan:    [121.5722,  24.9897  ],
  Nangang:    [121.6218,  25.0384  ],
  Shilin:     [121.5170,  25.0833  ],
  Beitou:     [121.5000,  25.1167  ],
}

const CATEGORY_COLORS: Record<string, string> = {
  cafe:               '#ea580c',
  convenience_store:  '#3b82f6',
  grocery:            '#22c55e',
  restaurant:         '#a855f7',
  bakery:             '#f59e0b',
  beverage_store:     '#06b6d4',
}
const DEFAULT_COLOR = '#94a3b8'

type Place = {
  id: string
  name: string
  address: string | null
  lat: number
  lng: number
  category: string
  district: string | null
  founded_date: string | null
  google_place_id: string | null
  status: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  const mapContainer   = useRef<HTMLDivElement | null>(null)
  const map            = useRef<mapboxgl.Map | null>(null)
  const sessionRef     = useRef<Session | null>(null)
  const allPlacesRef   = useRef<Place[]>([])
  const popupRef       = useRef<mapboxgl.Popup | null>(null)
  const moveEndBound   = useRef<(() => void) | null>(null)

  const [session,          setSession]          = useState<Session | null>(null)
  const [isAdmin,          setIsAdmin]          = useState(false)
  const [categories,       setCategories]       = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState('cafe')
  const [visiblePlaces,    setVisiblePlaces]    = useState<Place[]>([])
  const [totalLoaded,      setTotalLoaded]      = useState(0)
  const [loading,          setLoading]          = useState(false)
  const [researching,      setResearching]      = useState(false)
  const [loadError,        setLoadError]        = useState<string | null>(null)
  const [hoveredId,        setHoveredId]        = useState<string | null>(null)

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      sessionRef.current = session
      setIsAdmin(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      sessionRef.current = s
      setIsAdmin(s?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Categories ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(j => setCategories(j.categories || []))
      .catch(() => setCategories(Object.keys(CATEGORY_COLORS)))
  }, [])

  // ── Filter visible places by current map bounds ───────────────────────────────
  const updateVisible = useCallback(() => {
    if (!map.current) return
    const b = map.current.getBounds()
    if (!b) return
    const visible = allPlacesRef.current.filter(
      p => p.lat >= b.getSouth() && p.lat <= b.getNorth() &&
           p.lng >= b.getWest()  && p.lng <= b.getEast(),
    )
    setVisiblePlaces(visible)
  }, [])

  // ── Map init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
      setLoadError('Missing NEXT_PUBLIC_MAPBOX_TOKEN')
      return
    }
    map.current = new mapboxgl.Map({
      container:   mapContainer.current,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      style:       'mapbox://styles/mapbox/streets-v11',
      center:      [121.5436, 25.0374],
      zoom:        13,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Register moveend listener (once, stable ref) ─────────────────────────────
  useEffect(() => {
    if (!map.current) return
    if (moveEndBound.current) map.current.off('moveend', moveEndBound.current)
    moveEndBound.current = updateVisible
    map.current.on('moveend', updateVisible)
    return () => { map.current?.off('moveend', updateVisible) }
  }, [updateVisible])

  // ── Load all places for category from Supabase ────────────────────────────────
  const loadCategory = useCallback(async (cat: string) => {
    if (!map.current) return
    setLoading(true)
    setLoadError(null)

    try {
      const res  = await fetch(`/api/supabase/places?category=${encodeURIComponent(cat)}`)
      const json = await res.json()
      const rows: Place[] = (json.results || []).filter((p: any) => p.lat != null && p.lng != null)

      allPlacesRef.current = rows
      setTotalLoaded(rows.length)

      // Wait for map style
      await new Promise<void>(resolve => {
        if (map.current!.isStyleLoaded()) resolve()
        else map.current!.once('styledata', () => resolve())
      })

      const color = CATEGORY_COLORS[cat] ?? DEFAULT_COLOR

      // Remove previous layers/source
      if (map.current.getLayer('places-highlight')) map.current.removeLayer('places-highlight')
      if (map.current.getLayer('places-circles'))   map.current.removeLayer('places-circles')
      if (map.current.getLayer('places-heat'))      map.current.removeLayer('places-heat')
      if (map.current.getSource('places'))          map.current.removeSource('places')

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: rows.map(p => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
          properties: { id: p.id, name: p.name, address: p.address || '' },
        })),
      }

      map.current.addSource('places', { type: 'geojson', data: geojson })

      // Heatmap layer (low zoom)
      map.current.addLayer({
        id:      'places-heat',
        type:    'heatmap',
        source:  'places',
        maxzoom: 14,
        paint: {
          'heatmap-weight':     1,
          'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 0, 0.4, 14, 1.5],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.2, `${color}44`,
            0.6, `${color}aa`,
            1,   color,
          ],
          'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 0, 12, 14, 30],
          'heatmap-opacity': 0.75,
        },
      })

      // Circle layer (high zoom)
      map.current.addLayer({
        id:      'places-circles',
        type:    'circle',
        source:  'places',
        minzoom: 11,
        paint: {
          'circle-radius':       6,
          'circle-color':        color,
          'circle-opacity':      0.85,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      })

      // Highlight layer — filtered to a single hovered feature
      map.current.addLayer({
        id:     'places-highlight',
        type:   'circle',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],   // nothing by default
        paint: {
          'circle-radius':       13,
          'circle-color':        color,
          'circle-opacity':      1,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      })

      // Popup on click
      map.current.on('click', 'places-circles', e => {
        const props = e.features?.[0]?.properties
        if (!props) return
        const coords = (e.features![0].geometry as any).coordinates
        popupRef.current?.remove()
        popupRef.current = new mapboxgl.Popup({ offset: 12 })
          .setLngLat(coords)
          .setHTML(
            `<strong>${props.name}</strong><br/><span style="font-size:12px;color:#555">${props.address}</span>`,
          )
          .addTo(map.current!)
      })

      map.current.on('mouseenter', 'places-circles', () => { map.current!.getCanvas().style.cursor = 'pointer' })
      map.current.on('mouseleave', 'places-circles', () => { map.current!.getCanvas().style.cursor = '' })

      // Initial visible places after load
      setTimeout(updateVisible, 80)

    } catch (e) {
      setLoadError('Failed to load: ' + String(e))
    } finally {
      setLoading(false)
    }
  }, [updateVisible])

  // Reload when category changes
  useEffect(() => {
    if (!map.current) return
    loadCategory(selectedCategory)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory])

  // ── Hover a list item → highlight on map + popup ──────────────────────────────
  const handleHoverEnter = useCallback((place: Place) => {
    setHoveredId(place.id)
    if (!map.current) return

    // Highlight the pin
    map.current.setFilter('places-highlight', ['==', ['get', 'id'], place.id])

    // Popup (without moving map)
    popupRef.current?.remove()
    popupRef.current = new mapboxgl.Popup({ offset: 16, closeButton: false, closeOnClick: false })
      .setLngLat([place.lng, place.lat])
      .setHTML(
        `<strong>${place.name}</strong><br/><span style="font-size:12px;color:#555">${place.address || ''}</span>`,
      )
      .addTo(map.current)
  }, [])

  const handleHoverLeave = useCallback(() => {
    setHoveredId(null)
    if (!map.current) return
    if (map.current.getLayer('places-highlight'))
      map.current.setFilter('places-highlight', ['==', ['get', 'id'], ''])
    popupRef.current?.remove()
    popupRef.current = null
  }, [])

  // Click list item → fly to
  const handleItemClick = useCallback((place: Place) => {
    if (!map.current) return
    map.current.easeTo({ center: [place.lng, place.lat], zoom: Math.max(map.current.getZoom(), 16), duration: 500 })
  }, [])

  // ── Navigate to district ──────────────────────────────────────────────────────
  const flyToDistrict = useCallback((name: string) => {
    const [lng, lat] = DISTRICTS[name]
    map.current?.easeTo({ center: [lng, lat], zoom: 14, duration: 600 })
  }, [])

  // ── Research this area (admin only, hits Google API, then re-loads) ───────────
  const researchArea = useCallback(async () => {
    const token = sessionRef.current?.access_token
    if (!token || !map.current) return
    setResearching(true)
    setLoadError(null)
    try {
      const { lng, lat } = map.current.getCenter()
      const url = `/api/places?query=${encodeURIComponent(selectedCategory)}&lat=${lat}&lng=${lng}&radius=2000&force_refresh=true`
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      await loadCategory(selectedCategory)
    } catch (e: any) {
      setLoadError(e.message || 'Research failed')
    } finally {
      setResearching(false)
    }
  }, [selectedCategory, loadCategory])

  const color = CATEGORY_COLORS[selectedCategory] ?? DEFAULT_COLOR

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar isAdmin={isAdmin} userEmail={session?.user?.email} />

      <div className="h-[calc(100vh-64px)] flex flex-col md:flex-row">

        {/* ── Map ── */}
        <main className="w-full md:w-3/4 h-1/2 md:h-full relative">
          {loadError && <ErrorBanner message={loadError} />}
          <div className="h-full" ref={mapContainer} />
        </main>

        {/* ── Sidebar ── */}
        <aside className="w-full md:w-1/4 flex flex-col bg-white border-l border-gray-200 h-1/2 md:h-full">

          {/* Header */}
          <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-100">
            <h1 className="text-base font-bold text-gray-900 tracking-tight">Taipei Business Map</h1>
            <p className="text-xs text-gray-400 mt-0.5">Location intelligence for every district</p>
          </div>

          {/* Category tabs */}
          <div className="shrink-0 px-5 py-3 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Category</p>
            <div className="flex flex-wrap gap-1.5">
              {(categories.length ? categories : Object.keys(CATEGORY_COLORS)).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                  style={
                    selectedCategory === cat
                      ? { backgroundColor: CATEGORY_COLORS[cat] ?? DEFAULT_COLOR, color: '#fff' }
                      : { backgroundColor: '#f3f4f6', color: '#6b7280' }
                  }
                >
                  {cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* District shortcuts */}
          <div className="shrink-0 px-5 py-3 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Jump to district</p>
            <div className="flex flex-wrap gap-1">
              {Object.keys(DISTRICTS).map(d => (
                <button
                  key={d}
                  onClick={() => flyToDistrict(d)}
                  className="px-2 py-0.5 rounded text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="shrink-0 px-5 py-3 border-b border-gray-100">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading {selectedCategory.replace(/_/g, ' ')}…
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-bold" style={{ color }}>{visiblePlaces.length}</span>
                <span className="text-gray-400 text-xs">in view</span>
                <div className="w-px h-4 bg-gray-200" />
                <span className="font-bold text-gray-500">{totalLoaded}</span>
                <span className="text-gray-400 text-xs">in DB</span>
              </div>
            )}
          </div>

          {/* Research button — admin only, when DB has sparse data */}
          {!loading && isAdmin && totalLoaded < 30 && (
            <div className="shrink-0 px-5 py-3 border-b border-gray-100 bg-blue-50">
              <button
                onClick={researchArea}
                disabled={researching}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-blue-700 disabled:opacity-60 active:scale-[0.98] transition"
              >
                {researching ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                )}
                {researching ? 'Fetching from Google…' : 'Research this area'}
              </button>
              <p className="text-[11px] text-blue-400 mt-1.5 text-center">
                {totalLoaded === 0 ? 'No data yet — pulls from Google Maps' : `Only ${totalLoaded} results in DB`}
              </p>
            </div>
          )}

          {/* ── Store list (scrollable) ── */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {!loading && visiblePlaces.length > 0 ? (
              <>
                <div className="sticky top-0 bg-white px-5 py-2 border-b border-gray-100 z-10">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Stores in view · {visiblePlaces.length}
                  </p>
                </div>
                <ul>
                  {visiblePlaces.map((place, i) => (
                    <li
                      key={place.id}
                      className={`flex items-start gap-3 px-5 py-2.5 border-b border-gray-50 cursor-pointer transition-colors ${
                        hoveredId === place.id ? 'bg-orange-50' : 'hover:bg-gray-50'
                      }`}
                      onMouseEnter={() => handleHoverEnter(place)}
                      onMouseLeave={handleHoverLeave}
                      onClick={() => handleItemClick(place)}
                    >
                      <span
                        className="shrink-0 mt-0.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                        style={{ backgroundColor: color }}
                      >
                        {i + 1 > 99 ? '·' : i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 leading-snug truncate">{place.name}</p>
                        {place.address && (
                          <p className="text-xs text-gray-400 mt-0.5 leading-snug truncate">{place.address}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : !loading ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10 text-gray-400">
                <svg className="w-8 h-8 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <p className="text-sm font-medium text-gray-500">
                  {totalLoaded === 0 ? 'No stores in DB' : 'No stores in this view'}
                </p>
                <p className="text-xs mt-1 text-gray-400">
                  {totalLoaded === 0
                    ? isAdmin ? 'Use "Research this area" to fetch from Google' : 'This area has no data yet'
                    : 'Pan or zoom out to see more'}
                </p>
              </div>
            ) : null}
          </div>

          {/* ── Bottom links ── */}
          <div className="shrink-0 border-t border-gray-100">
            <Link
              href="/time-machine"
              className="flex items-center justify-between w-full px-5 py-3 hover:bg-gray-50 transition group border-b border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Time Machine</p>
                  <p className="text-xs text-gray-400">Watch the city grow year by year</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-300 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <div className="flex items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Report a store</p>
                <p className="text-xs text-gray-400">Coming soon</p>
              </div>
            </div>
          </div>

        </aside>
      </div>
    </>
  )
}
