import type { NextApiRequest, NextApiResponse } from 'next'
import getDb from '@/lib/db'

function checkAdmin(req: NextApiRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return req.headers.authorization?.split(' ')[1] === secret
}

// PUT /api/admin/place?id=<uuid>  — update a place
// DELETE /api/admin/place?id=<uuid> — delete a place
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdmin(req)) return res.status(403).json({ error: 'Forbidden' })

  const sql = getDb()
  if (!sql) return res.status(503).json({ error: 'DB unavailable' })

  const { id } = req.query as { id: string }
  if (!id) return res.status(400).json({ error: 'id is required' })

  try {
    if (req.method === 'PUT') {
      const { name, address, category, founded_date } = req.body as Record<string, string>
      await sql`
        UPDATE places
        SET name=${name}, address=${address ?? null}, category=${category ?? null},
            founded_date=${founded_date || null}
        WHERE id=${id}::uuid
      `
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM places WHERE id=${id}::uuid`
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (e) {
    console.error('[admin/place]', e)
    return res.status(500).json({ error: String(e) })
  }
}
