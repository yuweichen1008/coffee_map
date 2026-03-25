Coffee Map MVP

This workspace contains a minimal Next.js prototype to validate the Coffee Map concept described in your plan: full-screen Google Map, Places proxy API, and a simple report -> points API stub.

What I added
- Next.js scaffold (pages, API routes)
- Frontend: `pages/index.tsx` — loads Google Maps JS API, shows a full-screen map and a sidebar with "搜尋咖啡店" and "回報新開店家" buttons.
- API routes: `pages/api/places.ts` (server-side proxy to Google Places Nearby Search) and `pages/api/report.ts` (supabase insert stub and returns awarded points)
- Tailwind / PostCSS config and minimal styles
- `package.json` to run the app

Environment variables
Create a `.env.local` at the project root with:

NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_key_here
GOOGLE_MAPS_API_KEY=your_server_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

Notes
- For rapid prototyping you can use the same Google API key for client and server, but for security create separate keys.
- Supabase usage in `pages/api/report.ts` is optional for MVP; if not configured the endpoint still returns awarded points.

How to run (macOS / zsh)
1. Install dependencies

```bash
cd /Users/sami/code/coffee_map
npm install
```

2. Run dev server

```bash
npm run dev
```

Open http://localhost:3000 and click "搜尋咖啡店".

Next steps
- Add clustering and heatmap overlay using Google Maps visualization library
- Implement Supabase auth and persist user points
- Add supply vendor table and UI in sidebar

Seeding Supabase for local testing
1) Option A — run SQL directly in Supabase SQL editor:

	- Open your Supabase project -> SQL Editor and run the contents of `db/seed.sql`.

2) Option B — run the Node seeding script from this repo (requires env vars):

```bash
cd /Users/sami/code/coffee_map
# create .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
node scripts/seed.js
```

After seeding, reload the app and use the sidebar to select category `cafe` or zipcode `104` to see seeded places.
