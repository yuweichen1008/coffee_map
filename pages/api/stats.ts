import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { type } = req.query as { type?: string }
  if (!type) return res.status(400).json({ error: 'type is required' })

  const sql = getDb()
  if (!sql) return res.status(200).json({ type, count: 0 })

  try {
    const [row] = await sql`
      SELECT COUNT(*)::int AS count FROM places
      WHERE category = ${type} AND status != 'closed'
    `
    return res.status(200).json({ type, count: row?.count ?? 0 })
  } catch (e) {
    console.error('[stats]', e)
    return res.status(200).json({ type, count: 0 })
  }
}
