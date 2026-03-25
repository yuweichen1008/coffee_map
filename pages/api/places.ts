import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  let supabase: SupabaseClient | null = null
  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey)
      console.debug('Supabase client created')
    } catch (e) {
      console.warn('Failed to create Supabase client; continuing without cache', e)
      supabase = null
    }
  } else {
    console.debug('Supabase not configured; proceeding without cache')
  }

  const { query, lat, lng, radius: radiusQ, maxPages: maxPagesQ } = req.query as {
    query?: string
    lat?: string
    lng?: string
    radius?: string
    maxPages?: string
  }
  const key =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return res.status(500).json({ error: 'Missing server API key' })
  
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  const keyword = (query as string) || 'cafe'
  let radiusMeters = parseInt(String(radiusQ || ''), 10)
  if (!Number.isFinite(radiusMeters) || radiusMeters < 1) radiusMeters = 2000
  radiusMeters = Math.min(50000, Math.max(200, radiusMeters))

  console.debug('Places API called with', {
    keyword,
    parsedLat,
    parsedLng,
    radiusMeters,
  })

  // try cache lookup in Supabase using simple bounding-box approximation
  if (supabase) {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); // 7 days cache

      // bounding box approximation
      const metersToLat = (m: number) => m / 111320
      const metersToLng = (m: number, lat: number) => m / (111320 * Math.cos(lat * Math.PI / 180))
      const latDelta = metersToLat(radiusMeters)
      const lngDelta = metersToLng(radiusMeters, parsedLat)
      const latMin = parsedLat - latDelta
      const latMax = parsedLat + latDelta
      const lngMin = parsedLng - lngDelta
      const lngMax = parsedLng + lngDelta

      console.debug('Cache bbox', { latMin, latMax, lngMin, lngMax })

      const { data: cachedPlaces, error } = await supabase
        .from('places')
        .select('*')
        .eq('category', keyword)
        .gte('lat', latMin)
        .lte('lat', latMax)
        .gte('lng', lngMin)
        .lte('lng', lngMax)
        .gt('created_at', sevenDaysAgo.toISOString())

      if (error) {
        console.error('Supabase cache query failed:', error)
      } else if (cachedPlaces && cachedPlaces.length > 0) {
        console.debug('Returning cached places count=', cachedPlaces.length)
        return res.status(200).json({ results: cachedPlaces, source: 'cache' })
      }
    } catch (e) {
      console.error('Cache check failed:', e)
    }
  }

  const location = `${lat},${lng}`

  let maxPages = parseInt(String(maxPagesQ || ''), 10)
  if (!Number.isFinite(maxPages) || maxPages < 1) maxPages = 3
  maxPages = Math.min(3, Math.max(1, maxPages))

  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

  try {
    const aggregated: any[] = []
    let url: string | null = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${encodeURIComponent(
      location,
    )}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&key=${key}`

    for (let pageIndex = 0; url && pageIndex < maxPages; ) {
      const r = await fetch(url)
      const json = await r.json()

      if (json.status === 'INVALID_REQUEST' && url.includes('pagetoken')) {
        await delay(2500)
        continue
      }
      if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
        if (pageIndex === 0) {
          return res.status(502).json({
            error: json.error_message || json.status,
          })
        }
        console.warn('Places NearbySearch stopped', json.status, json.error_message)
        break
      }
      if (json.results?.length) aggregated.push(...json.results)

      if (!json.next_page_token) break
      await delay(2100)
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${encodeURIComponent(
        json.next_page_token,
      )}&key=${key}`
      pageIndex += 1
    }

    console.debug('Google Places returned', aggregated.length, 'results (paginated)')

    if (supabase && aggregated.length > 0) {
      const placesToInsert = aggregated.map((place: any) => ({
        name: place.name,
        address: place.vicinity,
        lat: place.geometry?.location?.lat || null,
        lng: place.geometry?.location?.lng || null,
        google_place_id: place.place_id,
        category: keyword,
        source: 'google',
      }))

      try {
        for (const p of placesToInsert) {
          if (!p.google_place_id) continue
          await supabase.from('places').upsert(p, { onConflict: ['google_place_id'] })
        }
        console.debug('Supabase upsert completed for places')
      } catch (e) {
        console.error('Supabase upsert failed:', e)
      }
    }

    return res.status(200).json({
      results: aggregated,
      status: 'OK',
      source: 'google',
    })
  } catch (error) {
    console.error('Google Maps API fetch failed:', error)
    return res.status(500).json({ error: 'Failed to fetch data from Google Maps' })
  }
}
