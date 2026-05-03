import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

// GET /api/sg/planning-areas
// Returns all Singapore planning area GeoJSON polygons for map overlay rendering.
// Cached aggressively — planning areas change at most annually.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const sql = getDb()
  if (!sql) return res.status(200).json({ areas: [] })

  try {
    const rows = await sql`
      SELECT name, geojson, area_sqkm
      FROM sg_planning_areas
      ORDER BY name
    `

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).json({ areas: rows })
  } catch (e) {
    console.error('[sg/planning-areas]', e)
    return res.status(200).json({ areas: [] })
  }
}
