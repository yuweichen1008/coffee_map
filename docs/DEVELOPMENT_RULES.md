# Development Rules — StorePulse

## Guiding Principles

1. **Singapore first.** Every new feature defaults to Singapore. Taipei is legacy; preserve but don't extend.
2. **Cached reads, gated writes.** Public users never trigger Google API calls. All writes are admin-only.
3. **Flat over nested.** Next.js pages are flat files — no sub-routing unless necessary.
4. **No premature abstraction.** Three similar API routes is fine; a generic "resource handler" is not.
5. **Signal > raw data.** Every feature should translate data into a business decision. Don't show tables, show insights.

---

## Naming Conventions

### Files
| Type | Pattern | Example |
|---|---|---|
| Page | `pages/[kebab].tsx` | `pages/discover.tsx` |
| API route | `pages/api/[kebab].ts` | `pages/api/hawker-rank.ts` |
| Component | `components/PascalCase.tsx` | `components/Navbar.tsx` |
| DB script | `db/[purpose].sql` | `db/init_all.sql` |
| Fetch script | `scripts/fetch/[target].py` | `scripts/fetch/fetch_places.py` |
| Preprocess script | `scripts/preprocess/[action].py` | `scripts/preprocess/update_founded_dates.py` |

### TypeScript
| Type | Pattern | Example |
|---|---|---|
| Type alias | `PascalCase` | `type Place = { ... }` |
| State var | `camelCase` | `const [selectedMRT, setSelectedMRT]` |
| Constant | `UPPER_SNAKE` | `const CATEGORY_COLORS` |
| API handler | `export default async function handler(req, res)` | — |

### Python scripts
| Type | Pattern | Example |
|---|---|---|
| Constants | `UPPER_SNAKE` | `SINGAPORE_DISTRICTS`, `CATEGORY_MAP` |
| Functions | `snake_case` | `def fetch_cell(lat, lng, radius, keyword)` |
| CLI args | `--kebab-case` | `--city singapore`, `--dry-run` |

### Database
| Type | Pattern | Example |
|---|---|---|
| Table | `snake_case` | `places`, `categories`, `districts` |
| Column | `snake_case` | `review_count`, `google_place_id` |
| Materialized view | `snake_case` | `zone_density`, `dead_zone_clusters` |
| Category slug | `snake_case` | `convenience_store`, `shopping_mall` |
| District slug | `Title_Case` | `Tanjong_Pagar`, `Ang_Mo_Kio` |

---

## Code Patterns

### API Route (standard pattern)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { param } = req.query as { param?: string }

  const { data, error } = await supabase
    .from('places')
    .select('id, name, district, rating, review_count, lat, lng')
    .eq('category', 'hawker')
    .neq('status', 'closed')
    .order('review_count', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
  return res.status(200).json({ results: data ?? [] })
}
```

### Page (standard structure)

```tsx
import { FC, useEffect, useState } from 'react'
import Head from 'next/head'
import Navbar from '../components/Navbar'

const MyPage: FC = () => {
  const [data, setData] = useState<MyType[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/my-endpoint')
      .then(r => r.json())
      .then(j => setData(j.results ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Head>
        <title>Page Title — StorePulse</title>
      </Head>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        {/* content */}
      </div>
    </>
  )
}

export default MyPage
```

### Supabase Spatial Query (bounding box pattern)

```typescript
const latDelta = radiusM / 111320
const lngDelta = radiusM / (111320 * Math.cos(lat * Math.PI / 180))

const { data } = await supabase
  .from('places')
  .select('...')
  .eq('category', category)
  .neq('status', 'closed')
  .gte('lat', lat - latDelta).lte('lat', lat + latDelta)
  .gte('lng', lng - lngDelta).lte('lng', lng + lngDelta)
  .limit(200)
```

### Python Seed Script (standard structure)

```python
parser = argparse.ArgumentParser()
parser.add_argument('--city',     default='singapore', choices=['taipei', 'singapore', 'all'])
parser.add_argument('--category', required=True)
parser.add_argument('--district', default=None)
parser.add_argument('--dry-run',  action='store_true')
parser.add_argument('--limit',    type=int, default=0)
args = parser.parse_args()

DISTRICTS = (SINGAPORE_DISTRICTS if args.city == 'singapore'
             else TAIPEI_DISTRICTS if args.city == 'taipei'
             else {**TAIPEI_DISTRICTS, **SINGAPORE_DISTRICTS})

category = CATEGORY_MAP.get(args.category.lower(), args.category.replace(' ', '_'))
```

---

## What NOT to Do

- **No client-side Google Maps API calls.** All Google Places fetches go through Python scripts or admin-gated API routes.
- **No Zustand, Redux, or Context for simple state.** React useState + props is sufficient for current scale.
- **No default Tailwind prose styles.** All typography is explicit utility classes.
- **No force-push to main.** Always create a commit; never amend published commits.
- **No bare `supabase.from('places').select('*')` in API routes.** Always specify columns explicitly.
- **No unauthenticated writes.** Any mutation must check `isAdmin(user)`.
- **No `dict | None` in Python 3.9.** Use bare `= None` default; type annotations break at runtime.

---

## Visual Design System

### Colors
| Role | Value |
|---|---|
| Background (pages) | `bg-gray-950` `#030712` |
| Surface (cards) | `bg-gray-900` `#111827` |
| Border | `border-white/8` |
| Primary accent | `orange-500` `#f97316` |
| Text primary | `white` |
| Text secondary | `text-gray-400` |
| Text muted | `text-gray-500` |

### Category color palette
```
cafe           #ea580c  orange
convenience    #3b82f6  blue
grocery        #22c55e  green
restaurant     #a855f7  purple
bakery         #f59e0b  amber
beverage_store #06b6d4  cyan
hawker         #eab308  yellow
supermarket    #10b981  emerald
pharmacy       #ec4899  pink
gym            #8b5cf6  violet
coworking      #0ea5e9  sky
childcare      #f43f5e  rose
laundromat     #64748b  slate
shopping_mall  #a855f7  purple
```

### Spacing / Typography
- Page max-width: `max-w-4xl mx-auto`
- Section label: `text-xs font-semibold uppercase tracking-widest text-orange-400`
- Page heading: `text-3xl font-bold tracking-tight`
- Body text: `text-sm text-gray-400`
- Card: `bg-gray-900 border border-white/8 rounded-xl px-4 py-3.5`

---

## Git Conventions

- Commit prefix: `feat:` `fix:` `refactor:` `docs:` `chore:`
- Branch: work directly on `main` for now (single dev)
- Co-author line: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Never commit: `.env.local`, `*.tsbuildinfo`, `node_modules/`, `.venv/`
