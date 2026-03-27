import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// prefer service role key if available for accurate counts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

let supabase: SupabaseClient | null = null
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey)
  } catch (e) {
    console.error('Failed to create Supabase client:', e)
    supabase = null
  }
} else {
  supabase = null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { type } = req.query as { type?: string };

  if (!type) {
    return res.status(400).json({ error: 'type is required' });
  }

  if (!supabase) {
    // be resilient for cold runs: return zero instead of 500
    console.warn('Supabase not configured — returning zero stats')
    return res.status(200).json({ type, count: 0 })
  }

  try {
    // Our places use 'category' not 'type'
    const { count, error } = await supabase
      .from('places')
      .select('*', { count: 'exact', head: true })
      .eq('category', type)
      .neq('status', 'closed');

    if (error) {
      // If table missing, return zero gracefully
      console.error('Supabase count failed:', error);
      if ((error as any).code === 'PGRST205') {
        return res.status(200).json({ type, count: 0 })
      }
      return res.status(500).json({ error: 'Failed to fetch stats from Supabase' });
    }

    return res.status(200).json({ type, count });
  } catch (error) {
    console.error('Stats fetch failed:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
