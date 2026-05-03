import type { NextApiRequest, NextApiResponse } from 'next'

// Registration is disabled — this is a single-admin tool.
// Admin access is granted via /api/auth/login with the admin email.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(403).json({ message: 'Registration is not available. Contact the admin.' })
}
