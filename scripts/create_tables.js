require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase URL or service key not found in .env.local');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createPlacesTable() {
  const { data, error } = await supabase
    .rpc('execute_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS places (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT,
          address TEXT,
          lat FLOAT,
          lng FLOAT,
          google_place_id TEXT UNIQUE,
          category TEXT,
          founded_date DATE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
        );
      `
    });

  if (error) {
    console.error('Error creating places table:', error);
  } else {
    console.log('Successfully created places table.');
  }
}

async function createTables() {
  await createPlacesTable();
}

createTables();
