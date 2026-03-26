Purpose

This folder contains the canonical SQL and instructions to initialize the Coffee Map Postgres schema used by the app. The single source of truth is `init_all.sql` (creates extensions, tables, spatial index, and inserts minimal sample data).

What the files are
- `init_all.sql` — merged schema + PostGIS setup + sample seed rows. Run this in Supabase SQL editor or via `scripts/init_db.js`.

Quick instructions

1) Recommended (via Supabase web UI)

- Open Supabase → SQL Editor and paste the contents of `db/init_all.sql`. Run the script. This is the safest option when you don't have direct DB admin connection string.

2) From your machine (requires DB connection string with permissions to create extensions)

- Add a `.env.local` at the repo root with a DB connection string:

  DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db>

- Run the init script (requires `pg` package installed):

  npm install pg
  npm run db:init

Seeding sample data

- To run the Node-based seed script (it uses Supabase client and the project service role key):

  Create `.env.local` with:

    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

  Then run:

    npm run db:seed

Notes and caveats
- Creating extensions (pgcrypto/postgis) and spatial indexes requires elevated permissions. Use Supabase SQL Editor or a DB URL belonging to a DB admin role.
- If you don't provide Supabase service role key or admin DB connection, the app will still run in read-only mode: Supabase writes are skipped.
- If your Supabase project has Row-Level Security (RLS) enabled, server-side writes may be blocked; use the service role key for server-side upserts.

If you want, I can split `init_all.sql` into smaller migration files and add a migration runner. Let me know which workflow you prefer (single-file init vs incremental migrations).
