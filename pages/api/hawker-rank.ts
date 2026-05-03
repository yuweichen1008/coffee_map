import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { district, limit: limitQ } = req.query as { district?: string; limit?: string }
  const limit = Math.min(parseInt(limitQ || '30', 10) || 30, 100)

  const sql = getDb()
  if (!sql) return res.status(200).json({ results: [] })

  try {
    const rows = district && district !== 'all'
      ? await sql`
          SELECT id, name, address, district, rating, review_count, lat, lng,
                 nea_grade, nea_inspected
          FROM places
          WHERE category = 'hawker' AND status != 'closed' AND district = ${district}
          ORDER BY review_count DESC NULLS LAST, rating DESC NULLS LAST
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, name, address, district, rating, review_count, lat, lng,
                 nea_grade, nea_inspected
          FROM places
          WHERE category = 'hawker' AND status != 'closed'
          ORDER BY review_count DESC NULLS LAST, rating DESC NULLS LAST
          LIMIT ${limit}
        `

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    return res.status(200).json({ results: rows })
  } catch (e) {
    console.error('[hawker-rank]', e)
    return res.status(200).json({ results: [] })
  }
}
