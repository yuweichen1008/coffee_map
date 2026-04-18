import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { lat: latQ, lng: lngQ, radius: radQ } = req.query as Record<string, string>
  const lat = parseFloat(latQ)
  const lng = parseFloat(lngQ)

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' })
  }

  const radius = Math.min(parseInt(radQ || '1500', 10) || 1500, 5000)
  const latDelta = radius / 111320
  const lngDelta = radius / (111320 * Math.cos(lat * Math.PI / 180))

  const { data, error } = await supabase
    .from('places')
    .select('id, name, address, district, rating, review_count, lat, lng')
    .eq('category', 'shopping_mall')
    .neq('status', 'closed')
    .gte('lat', lat - latDelta)
    .lte('lat', lat + latDelta)
    .gte('lng', lng - lngDelta)
    .lte('lng', lng + lngDelta)
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })

  const results = (data ?? [])
    .map(p => ({ ...p, distance_m: Math.round(haversineM(lat, lng, p.lat, p.lng)) }))
    .filter(p => p.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m || (b.review_count ?? 0) - (a.review_count ?? 0))

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate')
  return res.status(200).json({ results })
}
