import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

// Admin check: compare Bearer token against ADMIN_SECRET env var.
// No external auth service needed — single-admin tool.
function checkAdmin(req: NextApiRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  const token = req.headers.authorization?.split(' ')[1]
  return token === secret
}

async function getPlacesFromCache(
  sql: ReturnType<typeof import('@/lib/db').getDb>,
  lat: number, lng: number, radius: number, keyword: string,
  startDate?: string, endDate?: string
) {
  const latDelta = radius / 111320
  const lngDelta = radius / (111320 * Math.cos(lat * Math.PI / 180))

  const rows = startDate && endDate
    ? await sql!`
        SELECT * FROM places
        WHERE category = ${keyword}
          AND lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
          AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
          AND founded_date >= ${startDate} AND founded_date <= ${endDate}
      `
    : startDate
    ? await sql!`
        SELECT * FROM places
        WHERE category = ${keyword}
          AND lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
          AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
          AND founded_date >= ${startDate}
      `
    : await sql!`
        SELECT * FROM places
        WHERE category = ${keyword}
          AND lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
          AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
      `
  return rows
}

async function fetchFromGoogle(lat: number, lng: number, radius: number, keyword: string, maxPages: number) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('Missing Google Maps API key')

  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
  const aggregated: any[] = []
  let url: string | null =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${key}`

  for (let page = 0; url && page < maxPages; ) {
    const r    = await fetch(url)
    const json = await r.json()

    if (json.status === 'INVALID_REQUEST' && url.includes('pagetoken')) { await delay(2500); continue }
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      if (page === 0) throw new Error(json.error_message || json.status)
      break
    }
    if (json.results?.length) aggregated.push(...json.results)
    if (!json.next_page_token) break
    await delay(2100)
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${encodeURIComponent(json.next_page_token)}&key=${key}`
    page++
  }
  return aggregated
}

async function upsertPlaces(sql: NonNullable<ReturnType<typeof import('@/lib/db').getDb>>, places: any[], keyword: string) {
  let count = 0
  const errors: any[] = []

  for (const p of places) {
    if (!p.place_id) continue
    try {
      await sql`
        INSERT INTO places (name, address, lat, lng, google_place_id, category, source)
        VALUES (
          ${p.name},
          ${p.vicinity ?? null},
          ${p.geometry?.location?.lat ?? null},
          ${p.geometry?.location?.lng ?? null},
          ${p.place_id},
          ${keyword},
          'google'
        )
        ON CONFLICT (google_place_id) DO UPDATE SET
          name    = EXCLUDED.name,
          address = EXCLUDED.address,
          lat     = EXCLUDED.lat,
          lng     = EXCLUDED.lng
      `
      count++
    } catch (e) {
      errors.push({ place: p.name, error: String(e) })
    }
  }
  return { count, errors }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    query, lat, lng,
    radius: radiusQ, maxPages: maxPagesQ,
    force_refresh, start_date, end_date,
  } = req.query as Record<string, string>

  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' })

  const parsedLat = parseFloat(lat)
  const parsedLng = parseFloat(lng)
  const keyword   = query || 'cafe'
  let   radiusM   = Math.min(50000, Math.max(200, parseInt(radiusQ || '2000') || 2000))

  const sql = getDb()

  // Step 1: try cache (no auth required)
  if (force_refresh !== 'true' && sql) {
    try {
      const cached = await getPlacesFromCache(sql, parsedLat, parsedLng, radiusM, keyword, start_date, end_date)
      if (cached.length > 0) return res.status(200).json({ results: cached, source: 'cache' })
    } catch (e) {
      console.error('[places] cache query failed', e)
    }
  }

  // Step 2: cache miss — only admins may trigger a live Google fetch
  if (!checkAdmin(req)) {
    return res.status(200).json({ results: [], source: 'no_cache' })
  }

  try {
    const maxPages    = Math.min(3, Math.max(1, parseInt(maxPagesQ || '3') || 3))
    const googlePlaces = await fetchFromGoogle(parsedLat, parsedLng, radiusM, keyword, maxPages)

    let upsertReport = { count: 0, errors: [] as any[] }
    if (sql) upsertReport = await upsertPlaces(sql, googlePlaces, keyword)

    return res.status(200).json({
      results: googlePlaces,
      source:  'google',
      db:      { upsert: upsertReport },
    })
  } catch (e: any) {
    console.error('[places] Google fetch failed', e)
    return res.status(500).json({ error: e.message || 'Failed to fetch from Google Maps' })
  }
}
