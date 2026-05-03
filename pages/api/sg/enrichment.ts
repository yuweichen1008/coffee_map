import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

// GET /api/sg/enrichment?place_id=<uuid>
// Returns government data enrichment for a specific place:
//   NEA hygiene grade, ACRA registration, bus stop count, data sources
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { place_id } = req.query as { place_id?: string }
  if (!place_id) return res.status(400).json({ error: 'place_id required' })

  const sql = getDb()
  if (!sql) return res.status(200).json({ enrichment: null })

  try {
    const [row] = await sql`
      SELECT
        nea_grade,
        nea_inspected,
        acra_uen,
        acra_reg_date,
        acra_cease_date,
        bus_stops_400m,
        data_sources
      FROM places
      WHERE id = ${place_id}::uuid
    `

    if (!row) return res.status(404).json({ error: 'Place not found' })

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json({
      enrichment: {
        nea_grade:      row.nea_grade      ?? null,
        nea_inspected:  row.nea_inspected  ?? null,
        acra_verified:  Boolean(row.acra_uen),
        acra_uen:       row.acra_uen       ?? null,
        acra_reg_date:  row.acra_reg_date  ?? null,
        acra_cease_date: row.acra_cease_date ?? null,
        bus_stops_400m: row.bus_stops_400m ?? null,
        data_sources:   row.data_sources   ?? [],
      }
    })
  } catch (e) {
    console.error('[sg/enrichment]', e)
    return res.status(500).json({ error: String(e) })
  }
}
