// Usage: node scripts/seed.js
// Requires environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const { createClient } = require('@supabase/supabase-js')
// prefer .env.local (common for Next.js). fallback to .env
const dotenv = require('dotenv')
const fs = require('fs')
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' })
} else {
  dotenv.config()
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
if (!url || !key) {
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  try {
    console.log('Seeding categories (upsert to avoid duplicates)...')
    let r = await supabase.from('categories').upsert(
      [ { name: 'cafe' }, { name: 'restaurant' }, { name: 'bakery' }, { name: '米漢堡' } ],
      { onConflict: 'name' }
    )
    if (r.error) {
      console.error('categories upsert error', r.error)
      throw r.error
    }

    console.log('Seeding places...')
    r = await supabase.from('places').insert([
      { name: 'Sunny Coffee (seed)', lat: 25.0549, lng: 121.5255, category: 'cafe', zipcode: '104', source: 'seed' },
      { name: 'Morning Bites (seed)', lat: 25.0555, lng: 121.5265, category: '米漢堡', zipcode: '104', source: 'seed' },
      { name: 'Zhongshan Bakery (seed)', lat: 25.0535, lng: 121.5240, category: 'bakery', zipcode: '104', source: 'seed' }
    ])
    if (r.error) {
      // ignore duplicate key errors for places
      if (r.error.code === '23505') {
        console.warn('places insert: duplicate rows (ignored)')
      } else {
        console.error('places insert error', r.error)
        throw r.error
      }
    }

    console.log('Seed complete')
  } catch (e) {
    console.error('Seeding failed. If you see errors about missing tables, run db/seed.sql in Supabase SQL editor to create schema first.')
    console.error(e)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
