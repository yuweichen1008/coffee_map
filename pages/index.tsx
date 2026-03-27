import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '../lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Error from '../components/Error'

// ── Taipei district data ──────────────────────────────────────────────────────
const taipeiDistricts: Record<string, { lat: number; lng: number }> = {
  "Da'an":      { lat: 25.026,    lng: 121.543    },
  Xinyi:        { lat: 25.0348,   lng: 121.5677   },
  Wanhua:       { lat: 25.026285, lng: 121.497032 },
  Datong:       { lat: 25.063,    lng: 121.511    },
  Zhongzheng:   { lat: 25.03236,  lng: 121.51827  },
  Songshan:     { lat: 25.055,    lng: 121.554    },
  Zhongshan:    { lat: 25.05499,  lng: 121.52540  },
  Neihu:        { lat: 25.0667,   lng: 121.5833   },
  Wenshan:      { lat: 24.9897,   lng: 121.5722   },
  Nangang:      { lat: 25.03843,  lng: 121.621825 },
  Shilin:       { lat: 25.0833,   lng: 121.5170   },
  Beitou:       { lat: 25.1167,   lng: 121.5000   },
}

const DEFAULT_STORE_TYPES = ['cafe', 'grocery store', 'beverage store', 'boba']

// ── Grid helpers ──────────────────────────────────────────────────────────────
function districtBoundsFromCenter(center: { lat: number; lng: number }, halfKm = 1) {
  const latHalf = halfKm / 111.32
  const lngHalf = halfKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  return {
    north: center.lat + latHalf,
    south: center.lat - latHalf,
    east:  center.lng + lngHalf,
    west:  center.lng - lngHalf,
  }
}

function buildSearchGrid(bounds: ReturnType<typeof districtBoundsFromCenter>, rows: number, cols: number) {
  const { north, south, east, west } = bounds
  const latStep = (north - south) / rows
  const lngStep = (east  - west ) / cols
  const midLat  = (north + south) / 2
  const cellLatM = latStep * 111320
  const cellLngM = lngStep * 111320 * Math.cos((midLat * Math.PI) / 180)
  const radius = Math.min(5000, Math.max(850, Math.ceil(0.92 * Math.hypot(cellLatM, cellLngM) / 2)))
  const cells: { lat: number; lng: number; radius: number }[] = []
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      cells.push({ lat: south + (i + 0.5) * latStep, lng: west + (j + 0.5) * lngStep, radius })
  return cells
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  const mapContainer   = useRef<HTMLDivElement | null>(null)
  const map            = useRef<mapboxgl.Map | null>(null)
  const markersRef     = useRef<mapboxgl.Marker[]>([])
  const prevDistrictRef = useRef<string | null>(null)

  const [session,           setSession]           = useState<Session | null>(null)
  const [isAdmin,           setIsAdmin]            = useState(false)
  const [categories,        setCategories]         = useState<string[]>([])
  const [selectedDistrict,  setSelectedDistrict]   = useState('Zhongshan')
  const [selectedStoreType, setSelectedStoreType]  = useState('cafe')
  const [markers,           setMarkers]            = useState<mapboxgl.Marker[]>([])
  const [placeCount,        setPlaceCount]         = useState(0)
  const [savedCount,        setSavedCount]         = useState(0)
  const [loading,           setLoading]            = useState(false)
  const [loadError,         setLoadError]          = useState<string | null>(null)

  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Map init ────────────────────────────────────────────────────────────────
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
      center:      [taipeiDistricts[selectedDistrict].lng, taipeiDistricts[selectedDistrict].lat],
      zoom:        14,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
  })

  // ── Categories ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(j => setCategories(j.categories || []))
      .catch(() => setCategories(DEFAULT_STORE_TYPES))
  }, [])

  // ── Keep markersRef in sync ─────────────────────────────────────────────────
  useEffect(() => { markersRef.current = markers }, [markers])

  // ── Heatmap: auto-show whenever markers change ──────────────────────────────
  useEffect(() => {
    if (!map.current) return

    if (map.current.getLayer('heatmap'))        map.current.removeLayer('heatmap')
    if (map.current.getSource('heatmap-source')) map.current.removeSource('heatmap-source')

    if (markers.length === 0) return

    const points = markers
      .map(m => { try { return m.getLngLat() } catch { return null } })
      .filter(Boolean) as mapboxgl.LngLat[]

    if (points.length === 0) return

    map.current.addSource('heatmap-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: points.map(p => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        })),
      },
    })

    map.current.addLayer({
      id:     'heatmap',
      type:   'heatmap',
      source: 'heatmap-source',
      paint:  { 'heatmap-radius': 24, 'heatmap-intensity': 0.6, 'heatmap-opacity': 0.55 },
    })
  }, [markers])

  // ── Search ──────────────────────────────────────────────────────────────────
  const searchPlaces = useCallback(async (forceRefresh = false): Promise<void> => {
    if (!map.current) return
    setLoading(true)
    setLoadError(null)

    const center = taipeiDistricts[selectedDistrict]
    const cells  = buildSearchGrid(districtBoundsFromCenter(center), 5, 5)
    const q      = encodeURIComponent(selectedStoreType)

    const byPlaceId = new Map<string, any>()

    try {
      const CONCURRENCY = 4
      for (let i = 0; i < cells.length; i += CONCURRENCY) {
        const slice = cells.slice(i, i + CONCURRENCY)
        const results = await Promise.all(
          slice.map(async cell => {
            let url = `/api/places?query=${q}&lat=${cell.lat}&lng=${cell.lng}&radius=${Math.round(cell.radius)}&maxPages=1`
            if (forceRefresh) url += '&force_refresh=true'
            const res  = await fetch(url)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
            return data.results || []
          }),
        )
        for (const list of results)
          for (const place of list) {
            const id = place.place_id || place.google_place_id
            if (id && !byPlaceId.has(id)) byPlaceId.set(id, place)
          }
      }

      const rows = Array.from(byPlaceId.values())
      markersRef.current.forEach(m => m.remove())

      const newMarkers: mapboxgl.Marker[] = []
      const bounds = new mapboxgl.LngLatBounds()

      rows.forEach((place: any) => {
        const loc = place?.geometry?.location || { lat: place.lat, lng: place.lng }
        if (loc.lat == null || loc.lng == null) return
        const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
        const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng
        bounds.extend([lng, lat])
        const marker = new mapboxgl.Marker({ color: '#ea580c' })
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 8 }).setHTML(
            `<div style="max-width:200px"><strong>${place.name}</strong><br/><span style="font-size:12px;color:#555">${place.vicinity || place.address || ''}</span></div>`
          ))
          .addTo(map.current!)
        newMarkers.push(marker)
      })

      setMarkers(newMarkers)
      setPlaceCount(rows.length)
      if (newMarkers.length > 0) map.current.fitBounds(bounds, { padding: 48 })

      // Fetch saved count from Supabase
      try {
        const statsRes = await fetch(`/api/stats?type=${selectedStoreType}`)
        if (statsRes.ok) {
          const s = await statsRes.json()
          setSavedCount(s.count ?? 0)
        }
      } catch { /* non-critical */ }

    } catch (e: any) {
      setLoadError(e?.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [selectedDistrict, selectedStoreType])

  // ── Trigger search on filter change ────────────────────────────────────────
  useEffect(() => {
    if (!map.current) return
    const districtChanged = prevDistrictRef.current !== selectedDistrict
    prevDistrictRef.current = selectedDistrict

    const run = () => { void searchPlaces() }

    if (districtChanged)
      map.current.panTo([taipeiDistricts[selectedDistrict].lng, taipeiDistricts[selectedDistrict].lat])

    if (map.current.isStyleLoaded()) run()
    else map.current.once('idle', run)
  }, [selectedDistrict, selectedStoreType, searchPlaces])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar isAdmin={isAdmin} userEmail={session?.user?.email} />
      <div className="h-[calc(100vh-64px)] flex flex-col md:flex-row">

        {/* Map */}
        <main className="w-full md:w-3/4 h-1/2 md:h-full relative">
          {loadError && <Error message={loadError} />}
          <div className="h-full" ref={mapContainer} />
        </main>

        {/* Sidebar */}
        <aside className="w-full md:w-1/4 flex flex-col bg-white border-l border-gray-200 overflow-y-auto h-1/2 md:h-full">

          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <h1 className="text-lg font-bold text-gray-900">Taipei Business Map</h1>
            <p className="text-xs text-gray-400 mt-0.5">Explore store density across districts</p>
          </div>

          {/* Controls */}
          <div className="px-5 py-4 space-y-4 border-b border-gray-100">
            <div>
              <label htmlFor="district-select" className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                District
              </label>
              <select
                id="district-select"
                value={selectedDistrict}
                onChange={e => setSelectedDistrict(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {Object.keys(taipeiDistricts).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="store-type-select" className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Store Type
              </label>
              <select
                id="store-type-select"
                value={selectedStoreType}
                onChange={e => setSelectedStoreType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {(categories.length ? categories : DEFAULT_STORE_TYPES).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats */}
          <div className="px-5 py-4 border-b border-gray-100">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading stores…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-orange-50 rounded-lg px-3 py-3">
                  <p className="text-2xl font-bold text-orange-600">{placeCount}</p>
                  <p className="text-xs text-orange-400 mt-0.5">found nearby</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-3">
                  <p className="text-2xl font-bold text-gray-700">{savedCount}</p>
                  <p className="text-xs text-gray-400 mt-0.5">saved in DB</p>
                </div>
              </div>
            )}
          </div>

          {/* Time Machine CTA */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Explore History</p>
            <Link
              href="/time-machine"
              className="flex items-center justify-between w-full bg-gray-900 text-white rounded-lg px-4 py-3 hover:bg-gray-800 transition group"
            >
              <div>
                <p className="text-sm font-semibold">Time Machine</p>
                <p className="text-xs text-gray-400 mt-0.5">Watch the city grow year by year</p>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Coming soon */}
          <div className="px-5 py-4 mt-auto">
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-gray-200 px-4 py-3">
              <span className="text-lg">📍</span>
              <div>
                <p className="text-sm font-medium text-gray-700">Report a new store</p>
                <p className="text-xs text-gray-400 mt-0.5">Coming soon — earn points by contributing data</p>
              </div>
            </div>
          </div>

        </aside>
      </div>
    </>
  )
}
