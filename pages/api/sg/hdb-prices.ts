import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

// GET /api/sg/hdb-prices?town=<name>
// Returns median HDB resale price for a planning area/town.
// Consulting signal: high price = premium residential catchment.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { town } = req.query as { town?: string }
  const sql = getDb()
  if (!sql) return res.status(200).json({ prices: [] })

  try {
    const rows = town
      ? await sql`
          SELECT town, median_price_sgd, sample_count, year
          FROM sg_hdb_prices
          WHERE UPPER(town) = UPPER(${town})
          LIMIT 1
        `
      : await sql`
          SELECT town, median_price_sgd, sample_count, year
          FROM sg_hdb_prices
          ORDER BY median_price_sgd DESC
        `

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json({ prices: rows })
  } catch (e) {
    console.error('[sg/hdb-prices]', e)
    return res.status(200).json({ prices: [] })
  }
}
