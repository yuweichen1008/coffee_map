import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase: SupabaseClient | null = null
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey)
  } catch (e) {
    // If client creation fails for some reason, keep supabase null and continue
    console.error('Failed to create Supabase client:', e)
    supabase = null
  }
} else {
  // Not configured in this environment — that's ok for MVP
  supabase = null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { name, lat, lng } = req.body || {}
  // MVP: attempt to insert into 'reports' table if Supabase is configured
  if (supabase) {
    try {
      await supabase.from('reports').insert([{ name, lat, lng }])
    } catch (e) {
      console.error('Supabase insert failed (MVP):', e)
      // continue to return awarded points even if DB write fails
    }
  }
  // Return awarded points (MVP business rule)
  res.status(200).json({ awarded: 10 })
}
