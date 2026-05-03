import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

const FALLBACK = ['cafe', 'convenience_store', 'restaurant', 'bakery', 'beverage_store',
  'pharmacy', 'gym', 'hawker', 'coworking', 'supermarket', 'childcare', 'laundromat', 'shopping_mall']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sql = getDb()
  if (!sql) return res.status(200).json({ categories: FALLBACK })

  try {
    const rows = await sql`SELECT name FROM categories ORDER BY name`
    if (rows.length > 0) return res.status(200).json({ categories: rows.map(r => r.name) })

    // categories table empty — derive from places
    const placeRows = await sql`
      SELECT DISTINCT category FROM places
      WHERE status != 'closed' AND category IS NOT NULL
      ORDER BY category
    `
    return res.status(200).json({ categories: placeRows.map(r => r.category) })
  } catch (e) {
    console.error('[categories]', e)
    return res.status(200).json({ categories: FALLBACK })
  }
}
