import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')

  const sql = getDb()
  if (!sql) return res.status(200).json(fallback())

  try {
    const [active, closed, cats, dists] = await Promise.all([
      sql`SELECT COUNT(*)::int AS n FROM places WHERE status != 'closed'`,
      sql`SELECT COUNT(*)::int AS n FROM places WHERE status = 'closed'`,
      sql`SELECT COUNT(*)::int AS n FROM categories`,
      sql`SELECT COUNT(*)::int AS n FROM districts`,
    ])

    return res.status(200).json({
      active_stores:  active[0]?.n  ?? 0,
      closed_tracked: closed[0]?.n  ?? 0,
      categories:     cats[0]?.n    ?? 13,
      districts:      dists[0]?.n   ?? 31,
      cities: 2,
    })
  } catch {
    return res.status(200).json(fallback())
  }
}

function fallback() {
  return { active_stores: 0, closed_tracked: 0, categories: 13, districts: 31, cities: 2 }
}
