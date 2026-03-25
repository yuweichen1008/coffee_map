import { useEffect, useRef, useState } from 'react'

import Error from '../components/Error';

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

export default function Home() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [markers, setMarkers] = useState<any[]>([])
  const googleMapRef = useRef<any>(null)
  const heatmapRef = useRef<any>(null);

  const [zipcode, setZipcode] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  const [selectedDistrict, setSelectedDistrict] = useState('Zhongshan');
  const [selectedStoreType, setSelectedStoreType] = useState('cafe');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [stats, setStats] = useState({ type: '', count: 0 });
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Avoid injecting the Google Maps script multiple times
    if ((window as any).google && (window as any).google.maps) {
      console.debug('Google Maps already available')
      setMapLoaded(true)
      return
    }

    const existing = document.querySelector('#gmaps-script') as HTMLScriptElement | null
    let created = false
    if (existing) {
      console.debug('Found existing gmaps script element')
      // attach handlers
      existing.addEventListener('load', () => {
        if ((window as any).google && (window as any).google.maps) setMapLoaded(true)
        else setLoadError('Google Maps loaded but google.maps is undefined')
      })
      existing.addEventListener('error', () => setLoadError('Failed to load Google Maps script'))
      return
    }

    const key = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string) || ''
    if (!key) {
      setLoadError('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
      return
    }

    const script = document.createElement('script')
    script.id = 'gmaps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,visualization`
    script.async = true
    script.defer = true
    script.onload = () => {
      console.debug('Google Maps script loaded')
      if ((window as any).google && (window as any).google.maps) {
        setMapLoaded(true)
      } else {
        setLoadError('Google Maps loaded but google.maps is undefined')
      }
    }
    script.onerror = (e) => {
      console.error('Failed to load Google Maps script', e)
      setLoadError('Failed to load Google Maps script')
    }
    document.head.appendChild(script)
    created = true

    return () => {
      if (created) {
        const s = document.querySelector('#gmaps-script')
        if (s) s.remove()
      }
    }
  }, [])

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(j => setCategories(j.categories || []))
      .catch(() => setCategories(storeTypes))
  }, [])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    try {
      const g = (window as any).google
      if (!g || !g.maps) {
        setLoadError('google.maps is not available')
        return
      }
      googleMapRef.current = new g.maps.Map(mapRef.current, {
        center: taipeiDistricts[selectedDistrict],
        zoom: 15,
      })
    } catch (e: any) {
      console.error('Error creating Google Map', e)
      setLoadError(String(e?.message || e))
    }
  }, [mapLoaded])

  useEffect(() => {
    if (googleMapRef.current) {
      googleMapRef.current.panTo(taipeiDistricts[selectedDistrict]);
      searchCafes();
    }
  }, [selectedDistrict, selectedStoreType]);

  useEffect(() => {
    if (!googleMapRef.current) return;

    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
    }

    if (showHeatmap) {
      const g = (window as any).google
      if (!g || !g.maps || !g.maps.visualization) {
        console.error('google.maps.visualization not available when creating heatmap');
        return;
      }
      // Build safe points array: filter out invalid markers or positions
      const points = markers
        .map(m => {
          try {
            if (!m || typeof m.getPosition !== 'function') return null
            const pos = m.getPosition()
            if (!pos) return null
            // Normalize to plain {lat, lng}
            if (typeof pos.lat === 'function' && typeof pos.lng === 'function') {
              return { lat: pos.lat(), lng: pos.lng() }
            }
            if (pos.lat !== undefined && pos.lng !== undefined) {
              return { lat: pos.lat, lng: pos.lng }
            }
            return null
          } catch (e) {
            return null
          }
        })
        .filter(Boolean)

      if (points.length === 0) {
        console.warn('No valid points for heatmap')
        return
      }

      // Convert to LatLng objects expected by HeatmapLayer
      const latLngPoints = points.map((p: any) => new g.maps.LatLng(p.lat, p.lng))
      heatmapRef.current = new g.maps.visualization.HeatmapLayer({
        data: latLngPoints,
        map: googleMapRef.current
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


  async function searchCafes(): Promise<number> {
    setLoading(true);
    setLoadError(null);
    const { lat, lng } = taipeiDistricts[selectedDistrict];
    const res = await fetch(`/api/places?query=${selectedStoreType}&lat=${lat}&lng=${lng}`)
    try {
      const data = await res.json()
      if (res.ok) {
        markers.forEach(m => { if (m && typeof m.setMap === 'function') m.setMap(null) })
        const newMarkers: any[] = []
        if (!googleMapRef.current) return
        const g = (window as any).google
        if (!g || !g.maps) {
          console.error('google.maps not available when plotting markers')
          return
        }
        (data.results || []).forEach((place: any) => {
          const loc = place?.geometry?.location || { lat: place.lat, lng: place.lng };
          if (!loc) return
          const marker = new g.maps.Marker({
            position: loc,
            map: googleMapRef.current,
            title: place.name,
          })
          const infowindow = new g.maps.InfoWindow({ content: `<div><strong>${place.name}</strong><br/>${place.address || place.vicinity || ''}</div>` })
          marker.addListener('click', () => infowindow.open(googleMapRef.current, marker))
          newMarkers.push(marker)
        })
        setMarkers(newMarkers)
        // return number of markers plotted for callers
        return newMarkers.length
      } else {
        setLoadError(data.error);
      }
    } catch (e) {
      console.error('Error searching cafes', e)
      setLoadError('搜尋失敗: ' + String(e))
    } finally {
      setLoading(false);
    }
    return 0
  }

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

  return (
    <div className="h-screen flex">
      <main className="w-3/4 h-full">
        {!mapLoaded && !loadError && <div className="flex h-full items-center justify-center">Map is loading...</div>}
        {loadError && <Error message={loadError} />}
        <div className="h-full" ref={mapRef} title="Map" />
      </main>
      <aside className="w-1/4 p-4 bg-white shadow">
        <h2 className="text-xl font-bold mb-2">Coffee Map MVP</h2>
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
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700">Zipcode (optional)</label>
          <input value={zipcode} onChange={e => setZipcode(e.target.value)} placeholder="e.g. 104" className="mt-1 block w-full p-2 border rounded" />
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Stats</h3>
          <p>Saved {stats.type} stores: {stats.count}</p>
        </div>
        <div className="mt-4">
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
          <button onClick={reportNewPlace} className="mt-2 bg-green-600 text-white px-3 py-2 rounded">回報新開店家（+10）</button>
          {reportStatus && <p className="mt-2 text-sm text-gray-600">{reportStatus}</p>}
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Developer</h3>
          <button onClick={testHeatmap} className="mt-2 bg-indigo-600 text-white px-3 py-2 rounded">Test Heatmap</button>
        </div>
      </aside>
    </div>
  )
}
