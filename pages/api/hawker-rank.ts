import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { district, limit: limitQ } = req.query as { district?: string; limit?: string }
  const limit = Math.min(parseInt(limitQ || '30', 10) || 30, 100)

  let query = supabase
    .from('places')
    .select('id, name, address, district, rating, review_count, lat, lng')
    .eq('category', 'hawker')
    .neq('status', 'closed')
    .order('review_count', { ascending: false })
    .order('rating', { ascending: false })
    .limit(limit)

  if (district && district !== 'all') {
    query = query.eq('district', district)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
  return res.status(200).json({ results: data ?? [] })
}
