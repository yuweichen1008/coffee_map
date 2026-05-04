import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { name, lat, lng } = req.body || {}
  const sql = getDb()
  if (sql) {
    try {
      await sql`INSERT INTO reports (name, lat, lng) VALUES (${name}, ${lat}, ${lng})`
    } catch {
      // table may not exist — continue
    }
  }
  res.status(200).json({ awarded: 10 })
}
