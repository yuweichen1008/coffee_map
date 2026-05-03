import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

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

  const radius   = Math.min(parseInt(radQ || '1500', 10) || 1500, 5000)
  const latDelta = radius / 111320
  const lngDelta = radius / (111320 * Math.cos(lat * Math.PI / 180))

  const sql = getDb()
  if (!sql) return res.status(200).json({ results: [] })

  try {
    const rows = await sql`
      SELECT id, name, address, district, rating, review_count, lat, lng
      FROM places
      WHERE category = 'shopping_mall' AND status != 'closed'
        AND lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
      LIMIT 50
    `

    type MallRow = { id: string; name: string; address: string | null; district: string | null; rating: number | null; review_count: number | null; lat: number; lng: number }
    const results = (rows as unknown as MallRow[])
      .map(p => ({ ...p, distance_m: Math.round(haversineM(lat, lng, p.lat, p.lng)) }))
      .filter(p => p.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m || (b.review_count ?? 0) - (a.review_count ?? 0))

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate')
    return res.status(200).json({ results })
  } catch (e) {
    console.error('[mrt-malls]', e)
    return res.status(200).json({ results: [] })
  }
}
