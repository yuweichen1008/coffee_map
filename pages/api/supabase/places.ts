import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { URL } from 'url'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

let supabase = null
if (supabaseUrl && supabaseKey) {
  try { supabase = createClient(supabaseUrl, supabaseKey) } catch (e) { supabase = null }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { category, zipcode } = req.query as { category?: string, zipcode?: string }
  if (!supabase) return res.status(200).json({ results: [] })
  try {
    let query = supabase.from('places').select('id,name,lat,lng,category,zipcode')
    if (category) query = query.eq('category', category)
    if (zipcode) query = query.eq('zipcode', zipcode)
    const { data, error } = await query.limit(500)
    if (error) throw error
    return res.status(200).json({ results: data })
  } catch (e) {
    console.error('Supabase places fetch failed', e)
    return res.status(200).json({ results: [] })
  }
}
