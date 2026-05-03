import type { NextApiRequest, NextApiResponse } from 'next'

// Simple admin login: if the email matches NEXT_PUBLIC_ADMIN_EMAIL,
// return the ADMIN_SECRET. The client stores it as the Bearer token.
// No OTP, no external auth service — single-admin tool.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' })

  const { email } = req.body
  if (!email) return res.status(400).json({ message: 'Email is required' })

  const adminEmail  = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminEmail || !adminSecret) {
    return res.status(503).json({ message: 'Auth not configured on server' })
  }

  if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
    // Return same message to avoid email enumeration
    return res.status(200).json({ message: 'If this email is registered, you will receive access.' })
  }

  return res.status(200).json({
    message: 'Admin access granted',
    token:   adminSecret,
  })
}
