import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { category, include_closed, offset, limit } = req.query as {
    category?:       string
    include_closed?: string
    offset?:         string
    limit?:          string
  }

  const sql = getDb()
  if (!sql) return res.status(200).json({ results: [], hasMore: false })

  const pageSize   = Math.min(parseInt(limit  ?? '500') || 500, 1000)
  const pageOffset = Math.max(parseInt(offset ?? '0')   || 0,   0)
  const showClosed = include_closed === 'true'

  try {
    // Build query dynamically by branching on filter combination
    const rows = await (
      category && showClosed ? sql`
        SELECT id,name,address,lat,lng,category,district,founded_date,closed_date,status
        FROM places WHERE category = ${category}
        LIMIT ${pageSize} OFFSET ${pageOffset}
      ` :
      category ? sql`
        SELECT id,name,address,lat,lng,category,district,founded_date,closed_date,status
        FROM places WHERE category = ${category} AND status != 'closed'
        LIMIT ${pageSize} OFFSET ${pageOffset}
      ` :
      showClosed ? sql`
        SELECT id,name,address,lat,lng,category,district,founded_date,closed_date,status
        FROM places
        LIMIT ${pageSize} OFFSET ${pageOffset}
      ` : sql`
        SELECT id,name,address,lat,lng,category,district,founded_date,closed_date,status
        FROM places WHERE status != 'closed'
        LIMIT ${pageSize} OFFSET ${pageOffset}
      `
    )

    return res.status(200).json({ results: rows, hasMore: rows.length === pageSize })
  } catch (e) {
    console.error('[supabase/places]', e)
    return res.status(200).json({ results: [], hasMore: false })
  }
}
