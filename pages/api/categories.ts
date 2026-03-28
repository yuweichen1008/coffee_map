import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Prefer the categories table; fall back to distinct values in places
    const { data: catRows, error: catErr } = await supabase
      .from('categories')
      .select('name')
      .order('name')

    if (!catErr && catRows && catRows.length > 0) {
      return res.status(200).json({ categories: catRows.map((r: any) => r.name) })
    }

    // categories table empty or missing — derive from places
    const { data: placeRows, error: placeErr } = await supabase
      .from('places')
      .select('category')
      .neq('status', 'closed')
      .not('category', 'is', null)

    if (placeErr) throw placeErr

    const seen = new Set<string>()
    const unique: string[] = []
    for (const r of placeRows ?? []) {
      const cat = r.category as string
      if (!seen.has(cat)) { seen.add(cat); unique.push(cat) }
    }
    unique.sort()
    return res.status(200).json({ categories: unique })
  } catch (e) {
    console.error('categories fetch failed', e)
    return res.status(200).json({ categories: ['cafe', 'convenience_store', 'restaurant', 'bakery', 'beverage_store'] })
  }
}
