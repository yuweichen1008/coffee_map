import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Skip all tests in this file when env is not configured. CI should provide these.
  describe.skip('Supabase integration (skipped - missing env)', () => {
    test('skipped', () => expect(true).toBeTruthy())
  })
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  describe('Supabase connectivity (integration)', () => {
    test('can read categories (safe, read-only)', async () => {
      const { data, error } = await supabase.from('categories').select('*').limit(1)
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
    }, 20000)
  })
}
