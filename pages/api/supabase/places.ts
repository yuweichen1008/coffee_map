import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { category, include_closed } = req.query as {
    category?:       string
    include_closed?: string   // 'true' → return active + closed; default active only
  }

  if (!supabase) return res.status(200).json({ results: [] })

  try {
    let query = supabase
      .from('places')
      .select('id,name,address,lat,lng,category,district,founded_date,closed_date,status')

    if (include_closed !== 'true') {
      // Default: exclude explicitly closed stores (home page, etc.)
      query = query.neq('status', 'closed')
    }
    // When include_closed=true we return everything — the Time Machine
    // handles active vs. closed rendering client-side.

    if (category) query = query.eq('category', category)

    const { data, error } = await query.limit(8000)
    if (error) throw error
    return res.status(200).json({ results: data })
  } catch (e) {
    console.error('Supabase places fetch failed', e)
    return res.status(200).json({ results: [] })
  }
}
