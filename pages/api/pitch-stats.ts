import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json(fallback())
  }

  try {
    const sb = createClient(supabaseUrl, supabaseKey)

    const [activeRes, closedRes, catRes, distRes] = await Promise.all([
      sb.from('places').select('*', { count: 'exact', head: true }).neq('status', 'closed'),
      sb.from('places').select('*', { count: 'exact', head: true }).eq('status', 'closed'),
      sb.from('categories').select('*', { count: 'exact', head: true }),
      sb.from('districts').select('*', { count: 'exact', head: true }),
    ])

    return res.status(200).json({
      active_stores:  activeRes.count  ?? 0,
      closed_tracked: closedRes.count  ?? 0,
      categories:     catRes.count     ?? 13,
      districts:      distRes.count    ?? 31,
      cities:         2,
    })
  } catch {
    return res.status(200).json(fallback())
  }
}

function fallback() {
  return { active_stores: 0, closed_tracked: 0, categories: 13, districts: 31, cities: 2 }
}
