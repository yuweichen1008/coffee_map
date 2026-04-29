# Known Issues — StorePulse

Bugs, limitations, and technical constraints. Ordered by impact.

---

## Active Issues

### KI-001 — Materialized views require manual refresh
**Severity:** Medium  
**Area:** Database / Data pipeline  
**Date discovered:** 2026-04  

`zone_density` and `dead_zone_clusters` are not auto-refreshed.
After any bulk data seed, views must be manually refreshed in Supabase SQL Editor:
```sql
REFRESH MATERIALIZED VIEW public.zone_density;
REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
```
**Workaround:** Run after every seed session.  
**Fix:** Add a Supabase Edge Function or pg_cron job to refresh nightly.

---

### KI-002 — District assignment uses scrape origin, not geocoding
**Severity:** Low  
**Area:** Data quality  
**Date discovered:** 2026-04  

Stores scraped while targeting district X are assigned `district = 'X'` regardless of actual location. A store near a district boundary may be ~5% mis-assigned.

**Workaround:** Acceptable for heatmap density analysis. For address-level reports, use lat/lng query, not district filter.  
**Fix:** Post-process with PostGIS `ST_Within` against district boundary polygons (requires adding `bounds` to districts table).

---

### KI-003 — `shopping_mall` data not yet seeded for Singapore
**Severity:** High (feature blocked)  
**Area:** Data  
**Date discovered:** 2026-04-29  

`/discover` MRT & Malls tab shows empty state because no `shopping_mall` records exist yet.

**Fix:** Run:
```bash
python3 scripts/fetch/fetch_places.py --city singapore --category "shopping mall"
```

---

### KI-004 — Python 3.9 incompatibility with union type hints
**Severity:** Low (known, documented)  
**Area:** Scripts  
**Date discovered:** 2026-04  

`def func(param: dict | None = None)` raises `TypeError` on Python 3.9. The `|` union syntax requires Python 3.10+.

**Workaround:** Use bare `= None` without type annotation: `def func(param=None)`.  
**Policy:** All script function signatures must avoid `X | Y` type hints.

---

### KI-005 — Closed store count in pitch-stats is near-zero (2)
**Severity:** Medium  
**Area:** Data  
**Date discovered:** 2026-04  

Only 2 stores are marked `status = 'closed'` in Supabase. The Dead Zone feature is under-populated.

**Fix:**
1. Run `scripts/admin/fetch_closed_businesses.py --source google --limit 500`
2. Import ACRA BizFile CSV for government-verified closures
3. Re-run closure check quarterly

---

### KI-006 — `pages/request.tsx` is placeholder
**Severity:** Low  
**Area:** Product  
**Date discovered:** 2026-04  

The `/request` page returns fake hardcoded profit/success percentages. Not linked from Navbar. Essentially unused.

**Fix:** Either build real district analysis UI or remove the route.

---

### KI-007 — Time Machine only shows Taipei data reliably
**Severity:** Medium  
**Area:** Feature  
**Date discovered:** 2026-04  

`founded_date` has not been backfilled for Singapore stores. The Time Machine year slider shows empty Singapore data.

**Fix:**
```bash
python3 scripts/preprocess/update_founded_dates.py --limit 500
```
Run after Singapore seeding is complete.

---

### KI-008 — Dev server port conflict
**Severity:** Low  
**Area:** Dev environment  
**Date discovered:** 2026-04  

If port 3000 is occupied (another Next.js app), `npm run dev` starts on port 3001 silently.

**Workaround:** Check terminal output. Or use `PORT=3002 npm run dev`.

---

## Resolved Issues

### RI-001 — NEXT_PUBLIC_ prefix missing on admin email
**Resolved:** 2026-04  
`ADMIN_EMAIL` env var was not accessible client-side. Fixed by renaming to `NEXT_PUBLIC_ADMIN_EMAIL`.

### RI-002 — Heatmap was solid, not faded
**Resolved:** 2026-04  
`heatmap-color` stops reached 100% alpha at density=1. Fixed by capping at `${color}bb` (~73% alpha) and using zoom-interpolated `heatmap-opacity` that fades to 0 at zoom 15.

### RI-003 — Python union type hint crash
**Resolved:** 2026-04  
`scrape(districts: dict | None = None)` failed on Python 3.9. Fixed by removing type annotation.

---

## Performance Constraints

| Constraint | Current | Target |
|---|---|---|
| Google Places API cost | ~$0.017 per request | Reduce with smarter caching |
| Supabase free tier row limit | 500MB | Monitor; upgrade at ~300K rows |
| Mapbox GL free tier | 50K map loads/month | Monitor; upgrade at launch |
| `places` table size | ~5K rows | No concern until ~500K rows |
| Bounding box query speed | <50ms | No concern at current scale |
| Materialized view refresh | Manual | Automate with pg_cron |
