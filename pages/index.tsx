import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase, isWritable } from '../lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';

import Error from '../components/Error';
import Link from 'next/link';
import DatePicker from 'react-datepicker';
import Navbar from '@/components/Navbar';



const taipeiDistricts = {
  'Da\'an': { lat: 25.026, lng: 121.543 },
  'Xinyi': { lat: 25.0348, lng: 121.5677 },
  'Wanhua': { lat: 25.026285, lng: 121.497032 },
  'Datong': { lat: 25.063, lng: 121.511 },
  'Zhongzheng': { lat: 25.03236, lng: 121.51827 },
  'Songshan': { lat: 25.055, lng: 121.554 },
  'Zhongshan': { lat: 25.05499, lng: 121.52540 },
  'Neihu': { lat: 25.0667, lng: 121.5833 },
  'Wenshan': { lat: 24.9897, lng: 121.5722 },
  'Nangang': { lat: 25.03843, lng: 121.621825 },
  'Shilin': { lat: 25.0833, lng: 121.5170 },
  'Beitou': { lat: 25.1167, lng: 121.5000 },
};

const storeTypes = ['cafe', 'grocery store', 'beverage store', 'boba'];

/** 以區中心往外約半徑 halfKm（公里）建立搜尋範圍，涵蓋整個生活圈 */
function districtBoundsFromCenter(
  center: { lat: number; lng: number },
  halfKm = 1,
) {
  const latHalf = halfKm / 111.32
  const lngHalf =
    halfKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  return {
    north: center.lat + latHalf,
    south: center.lat - latHalf,
    east: center.lng + lngHalf,
    west: center.lng - lngHalf,
  }
}

/** 將行政區掰成網格，多點打 Nearby Search 以突破單圈 20/60 筆上限 */
function buildDistrictSearchGrid(
  bounds: ReturnType<typeof districtBoundsFromCenter>,
  rows: number,
  cols: number,
) {
  const { north, south, east, west } = bounds
  const latStep = (north - south) / rows
  const lngStep = (east - west) / cols
  const midLat = (north + south) / 2
  const cellLatM = latStep * 111320
  const cellLngM = lngStep * 111320 * Math.cos((midLat * Math.PI) / 180)
  const radius = Math.min(
    5000,
    Math.max(850, Math.ceil(0.92 * Math.hypot(cellLatM, cellLngM) / 2)),
  )
  const cells: { lat: number; lng: number; radius: number }[] = []
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      cells.push({
        lat: south + (i + 0.5) * latStep,
        lng: west + (j + 0.5) * lngStep,
        radius,
      })
    }
  }
  return cells
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null)
  const [markers, setMarkers] = useState<any[]>([])
  
  const [zipcode, setZipcode] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  const [selectedDistrict, setSelectedDistrict] = useState('Zhongshan');
  const [selectedStoreType, setSelectedStoreType] = useState('cafe');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [stats, setStats] = useState({ type: '', count: 0 });
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [placeCount, setPlaceCount] = useState(0)
  const markersRef = useRef<any[]>([])
  const prevDistrictRef = useRef<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>({ googleKey: false, supabaseConfigured: false, supabaseWritable: false, upsertReports: [] })

  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsAdmin(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setIsAdmin(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    markersRef.current = markers
  }, [markers])

  useEffect(() => {
    if (map.current) return; // initialize map only once
    if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
      setLoadError('Missing NEXT_PUBLIC_MAPBOX_TOKEN');
      return;
    }
    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [taipeiDistricts[selectedDistrict].lng, taipeiDistricts[selectedDistrict].lat],
      zoom: 14
    });
  });


  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(j => setCategories(j.categories || []))
      .catch(() => setCategories(storeTypes))
  }, [])


  const searchCafes = useCallback(async (forceRefresh = false): Promise<number> => {
    setLoading(true)
    setLoadError(null)
    
    if (!map.current) {
      setLoading(false)
      setLoadError('Map is not ready for search')
      return 0
    }

    if (!session) {
      setLoading(false);
      setLoadError('You must be logged in to search');
      return 0;
    }

    const center = taipeiDistricts[selectedDistrict]
    const region = districtBoundsFromCenter(center)
    const cells = buildDistrictSearchGrid(region, 5, 5)
    const q = encodeURIComponent(selectedStoreType)
    const maxPages = 1
    const concurrency = 4

    const byPlaceId = new Map<string, any>()

  const aggregatedSupabaseReports: any[] = []
  try {
      for (let i = 0; i < cells.length; i += concurrency) {
        const slice = cells.slice(i, i + concurrency)
        const chunkResults = await Promise.all(
          slice.map(async cell => {
            let url = `/api/places?query=${q}&lat=${cell.lat}&lng=${cell.lng}&radius=${Math.round(
              cell.radius,
            )}&maxPages=${maxPages}`;
            if (forceRefresh) {
              url += '&force_refresh=true';
            }
            if (startDate) {
              url += `&start_date=${startDate.toISOString()}`;
            }
            if (endDate) {
              url += `&end_date=${endDate.toISOString()}`;
            }
            const res = await fetch(
              url,
              {
                headers: {
                  'Authorization': `Bearer ${session.access_token}`
                }
              }
            )
            const data = await res.json()
            if (!res.ok) {
              // throw server error message for UI
              throw (data.error || `HTTP ${res.status}`) as any
            }
            // gather supabase reports if present
            if (data.supabase) aggregatedSupabaseReports.push(data.supabase)
            return data.results || []
          }),
        )
        for (const list of chunkResults) {
          for (const place of list) {
            const id = place.place_id || place.google_place_id
            if (id && !byPlaceId.has(id)) byPlaceId.set(id, place)
          }
        }
      }

      const rows = Array.from(byPlaceId.values())

      markersRef.current.forEach(m => {
        if (m && typeof m.remove === 'function') m.remove()
      })

      if (!map.current) return 0

      const newMarkers: any[] = []
      const bounds = new mapboxgl.LngLatBounds();
      setPlaceCount(rows.length)

      // set debug info from supabase reports
      if (aggregatedSupabaseReports.length > 0) {
        setDebugInfo((d: any) => ({ ...d, upsertReports: aggregatedSupabaseReports }))
      }

      rows.forEach((place: any) => {
        const loc = place?.geometry?.location || { lat: place.lat, lng: place.lng }
        if (loc.lat == null || loc.lng == null) return
        const latNum = typeof loc.lat === 'function' ? loc.lat() : loc.lat
        const lngNum = typeof loc.lng === 'function' ? loc.lng() : loc.lng
        const pos: [number, number] = [lngNum, latNum];
        bounds.extend(pos)
        const marker = new mapboxgl.Marker({
          color: '#ea580c',
        })
          .setLngLat(pos)
          .setPopup(new mapboxgl.Popup().setHTML(`<div style="max-width:220px"><strong>${place.name}</strong><br/>${place.vicinity || place.address || ''}</div>`))
          .addTo(map.current!);
        
        newMarkers.push(marker)
      })

      setMarkers(newMarkers)

      if (newMarkers.length > 0) {
        map.current.fitBounds(bounds, { padding: 48 });
      }

      // Refresh stats after successful fetch
      try {
        const statsRes = await fetch(`/api/stats?type=${selectedStoreType}`);
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch (e) {
        console.warn('Failed to refresh stats after fetch', e);
      }

      return newMarkers.length
    } catch (e: any) {
      console.error('Error searching places', e)
      setLoadError('搜尋失敗: ' + String(e?.message || e))
      return 0
    } finally {
      setLoading(false)
      // update google key and supabase configured status for debug panel
      setDebugInfo((d: any) => ({
        ...d,
        googleKey: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
        supabaseConfigured: Boolean(supabase),
        supabaseWritable: Boolean(isWritable),
      }))
    }
  }, [selectedStoreType, selectedDistrict, session, startDate, endDate])

  useEffect(() => {
    if (!map.current) return
    
    const districtChanged = prevDistrictRef.current !== selectedDistrict
    prevDistrictRef.current = selectedDistrict

    const run = () => {
      void searchCafes()
    }

    if (districtChanged) {
      map.current.panTo([taipeiDistricts[selectedDistrict].lng, taipeiDistricts[selectedDistrict].lat])
      map.current.once('idle', run)
    }

    if (map.current.isStyleLoaded()) run()
    else {
      map.current.once('idle', run)
    }
  }, [selectedDistrict, selectedStoreType, searchCafes])

  useEffect(() => {
    if (!map.current) return;

    if (map.current.getLayer('heatmap')) {
      map.current.removeLayer('heatmap');
    }
    if (map.current.getSource('heatmap-source')) {
      map.current.removeSource('heatmap-source');
    }

    if (showHeatmap) {
      const points = markers
        .map(m => {
          try {
            if (!m || typeof m.getLngLat !== 'function') return null
            const pos = m.getLngLat()
            if (!pos) return null
            return { lat: pos.lat, lng: pos.lng }
          } catch (e) {
            return null
          }
        })
        .filter(Boolean)

      if (points.length === 0) {
        console.warn('No valid points for heatmap')
        return
      }

      const features = points.map(p => ({
        // cast to any to avoid strict GeoJSON typing in prototype
        type: 'Feature' as any,
        properties: {},
        geometry: {
          type: 'Point' as any,
          coordinates: [p!.lng, p!.lat]
        }
      }));

      map.current.addSource('heatmap-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: features
        }
      });

      map.current.addLayer({
        id: 'heatmap',
        type: 'heatmap',
        source: 'heatmap-source',
        paint: {
          'heatmap-radius': 20,
          'heatmap-intensity': 0.5,
        }
      });
    }
  }, [showHeatmap, markers]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`/api/stats?type=${selectedStoreType}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        } else {
          setLoadError("Failed to fetch stats.");
        }
      } catch (error) {
        setLoadError("Failed to fetch stats.");
      }
    }
    fetchStats();
  }, [selectedStoreType]);

  // Developer helper: run a search, enable heatmap and report number of points
  async function testHeatmap() {
    try {
      const count = await searchCafes()
      if (count > 0) {
        setShowHeatmap(true)
        alert(`Heatmap enabled — points plotted: ${count}`)
      } else {
        alert('No points plotted — cannot enable heatmap')
      }
    } catch (e) {
      console.error('Test heatmap failed', e)
      alert('Test heatmap failed: ' + String(e))
    }
  }

  async function reportNewPlace() {
    setReportStatus('Reporting...');
    try {
      const payload = { name: 'User reported Cafe', lat: 25.0545, lng: 121.525 }
      const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        const json = await res.json();
        setReportStatus(`Reported successfully! You got ${json.awarded} points.`);
      } else {
        setReportStatus('Report failed. Please try again.');
      }
    } catch (e) {
      console.error('Report failed', e)
      setReportStatus('Report failed: ' + String(e));
    }
  }

  const handleRegister = async () => {
    setMessage('');
  const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Registration successful! Please check your email to confirm.');
    }
  }

  const handleLogin = async () => {
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for the login link!');
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
  }


  return (
    <>
      <Navbar isAdmin={isAdmin} userEmail={session?.user?.email} />
      <div className="h-[calc(100vh-64px)] flex flex-col md:flex-row">
        <main className="w-full md:w-3/4 h-1/2 md:h-full">
          {loadError && <Error message={loadError} />}
          <div className="h-full" ref={mapContainer} title="Map" />
        </main>
        <aside className="w-full md:w-1/4 p-4 bg-white shadow overflow-y-auto h-1/2 md:h-full">
        <h2 className="text-xl font-bold mb-2">Coffee Heat Map Time Machine</h2>

        {!session ? (
          <div className="mb-4">
            <h3 className="font-semibold">Login / Register</h3>
            <input
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full p-2 border rounded"
            />
            <button onClick={handleLogin} className="mt-2 bg-blue-600 text-white px-3 py-2 rounded">Login with one-time code</button>
            <button onClick={handleRegister} className="mt-2 ml-2 bg-green-600 text-white px-3 py-2 rounded">Register</button>
            {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
          </div>
        ) : (
          <div className="mb-4">
            <h3 className="font-semibold">Welcome!</h3>
            <p>Logged in as: {session.user.email}</p>
            <button onClick={handleLogout} className="mt-2 bg-red-600 text-white px-3 py-2 rounded">Logout</button>
          </div>
        )}

        {loading && <div className="mb-2">Loading...</div>}
        <div className="mb-2">
          <label htmlFor="district-select" className="block text-sm font-medium text-gray-700">District</label>
          <select
            id="district-select"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {Object.keys(taipeiDistricts).map(district => (
              <option key={district} value={district}>{district}</option>
            ))}
          </select>
        </div>
        <div className="mb-2">
          <label htmlFor="store-type-select" className="block text-sm font-medium text-gray-700">Store Type</label>
          <select
            id="store-type-select"
            value={selectedStoreType}
            onChange={(e) => setSelectedStoreType(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {(categories.length ? categories : storeTypes).map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Highlights <span className="font-medium">orange dots</span> for{' '}
            <span className="font-medium">{selectedStoreType}</span> across the whole{' '}
            <span className="font-medium">{selectedDistrict}</span> search grid ({placeCount} from Google, deduped).
          </p>
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-.gray-700">Zipcode (optional)</label>
          <input value={zipcode} onChange={e => setZipcode(e.target.value)} placeholder="e.g. 104" className="mt-1 block w-full p-2 border rounded" />
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Stats</h3>
          <p>Saved {stats.type} stores: {stats.count}</p>
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Heat Map Legacy</h3>
          <p className="text-sm text-gray-600 mb-2">Store Count: {placeCount}</p>
          <label htmlFor="heatmap-toggle" className="flex items-center">
            <input
              type="checkbox"
              id="heatmap-toggle"
              checked={showHeatmap}
              onChange={() => setShowHeatmap(!showHeatmap)}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-600">Show Heatmap</span>
          </label>
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">回報與點數</h3>
          <button onClick={reportNewPlace} className="mt-2 bg-green-600 text-white px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed" disabled>回報新開店家（尚未開放）</button>
          {reportStatus && <p className="mt-2 text-sm text-gray-600">{reportStatus}</p>}
        </div>
        <div className="mt-4 p-3 bg-gray-50 border rounded">
          <h3 className="font-semibold">Debug</h3>
          <p className="text-sm">Google Maps Key: {debugInfo.googleKey ? 'present' : 'missing'}</p>
          <p className="text-sm">Supabase Configured: {debugInfo.supabaseConfigured ? 'yes' : 'no'}</p>
          <p className="text-sm">Supabase Writable: {debugInfo.supabaseWritable ? 'yes' : 'no'}</p>
          <div className="mt-2 text-xs">
            <strong>Upsert reports (recent):</strong>
            <pre className="text-xs max-h-40 overflow-auto">{JSON.stringify(debugInfo.upsertReports || [], null, 2)}</pre>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Developer</h3>
          <button onClick={testHeatmap} className="mt-2 bg-indigo-600 text-white px-3 py-2 rounded">Test Heatmap</button>
          <button onClick={() => searchCafes(true)} className="mt-2 ml-2 bg-red-600 text-white px-3 py-2 rounded">Force Refresh</button>
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Time Machine</h3>
          <div className="flex items-center">
            <DatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              placeholderText="Start Date"
              className="mt-1 block w-full p-2 border rounded"
            />
            <span className="mx-2">to</span>
            <DatePicker
              selected={endDate}
              onChange={(date) => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              placeholderText="End Date"
              className="mt-1 block w-full p-2 border rounded"
            />
          </div>
        </div>

        <div className="mt-4">
          <h3 className="font-semibold">About</h3>
          <Link href="/about" className="text-blue-500 hover:underline">
            About Us
          </Link>
        </div>
        <div className="mt-4">
            <h3 className="font-semibold">Request Analysis</h3>
            <Link href="/request" className="text-blue-500 hover:underline">
                Go to Request Page
            </Link>
        </div>
      </aside>
    </div>
    </>
  )
}
