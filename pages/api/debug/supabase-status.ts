import type { NextApiRequest, NextApiResponse } from 'next'
const { supabase, isConfigured, isWritable } = require('../../../lib/supabaseClient')

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ configured: !!supabase || isConfigured, writable: isWritable })
}
