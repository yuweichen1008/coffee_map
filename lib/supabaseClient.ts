import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY
const supabaseKey = serviceKey || publishableKey

let supabase: SupabaseClient | null = null
let isWritable = false

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey)
    isWritable = Boolean(serviceKey)
  } catch (e) {
    console.error('lib/supabaseClient: createClient failed', e)
    supabase = null
  }
} else {
  console.debug('lib/supabaseClient: Supabase not configured (missing URL or key)')
}

export { supabase, isWritable }
