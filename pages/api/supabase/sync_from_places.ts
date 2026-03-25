import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase = null
if (supabaseUrl && supabaseKey) {
  try { supabase = createClient(supabaseUrl, supabaseKey) } catch (e) { supabase = null }
}

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { lat, lng, radius = 2000, keyword = 'cafe' } = req.body || {}
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' })
  if (!GOOGLE_KEY) return res.status(500).json({ error: 'Missing server Google API key' })
  // call Google Places Nearby Search
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_KEY}`
  try {
    const r = await fetch(url)
    const json = await r.json()
    const places = (json.results || []).map((p: any) => ({
      name: p.name,
      lat: p.geometry?.location?.lat || null,
      lng: p.geometry?.location?.lng || null,
      category: keyword,
      zipcode: null,
      source: 'google',
    }))

    if (supabase) {
      for (const place of places) {
        try {
          await supabase.from('places').upsert(place, { onConflict: ['name', 'lat', 'lng'] })
        } catch (e) {
          console.error('Upsert failed for', place.name, e)
        }
      }
    }

    return res.status(200).json({ synced: places.length, places })
  } catch (e) {
    console.error('Places fetch failed', e)
    return res.status(500).json({ error: 'Places fetch failed' })
  }
}
