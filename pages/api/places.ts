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

  const { query, lat, lng } = req.query as { query?: string, lat?: string, lng?: string };
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(500).json({ error: 'Missing server API key' });
  
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  console.debug('Places API called with', { query, parsedLat, parsedLng })

  // try cache lookup in Supabase using simple bounding-box approximation
  const radiusMeters = 2000
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

  const location = `${lat},${lng}`;
  const radius = radiusMeters;
  const type = query || 'cafe';
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radius}&keyword=${encodeURIComponent(type)}&key=${key}`;

  try {
    const r = await fetch(url);
    const json = await r.json();
    console.debug('Google Places returned', json?.results?.length || 0, 'results')

    if (supabase && json.results && json.results.length > 0) {
      const placesToInsert = json.results.map((place: any) => ({
        name: place.name,
        address: place.vicinity,
        lat: place.geometry?.location?.lat || null,
        lng: place.geometry?.location?.lng || null,
        google_place_id: place.place_id,
        category: type,
        source: 'google',
      }));

      // Upsert using google_place_id as unique key
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

    return res.status(200).json({ ...json, source: 'google' });
  } catch (error) {
    console.error('Google Maps API fetch failed:', error);
    return res.status(500).json({ error: 'Failed to fetch data from Google Maps' });
  }
}
