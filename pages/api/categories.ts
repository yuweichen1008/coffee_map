import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

let supabase = null
if (supabaseUrl && supabaseKey) {
  try { supabase = createClient(supabaseUrl, supabaseKey) } catch (e) { supabase = null }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('categories').select('name')
      if (error) throw error
      return res.status(200).json({ categories: data.map((r: any) => r.name) })
    } catch (e) {
      console.error('Supabase categories fetch failed', e)
      // fallthrough to static
    }
  }
  return res.status(200).json({ categories: ['cafe', 'restaurant', 'bakery', '米漢堡'] })
}
