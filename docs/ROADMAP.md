# Roadmap — StorePulse

Status key: ✅ Done · 🔄 In progress · 📋 Planned · 💡 Idea

---

## Phase 1 — Foundation (Complete)

✅ Next.js + Supabase + Mapbox setup  
✅ Google Places 3×3 grid scraper (`scripts/fetch/fetch_places.py`)  
✅ Taipei data: 12 districts, 5 core categories  
✅ Interactive heatmap with category filter  
✅ Time Machine (year-by-year opening/closure)  
✅ Admin authentication (email gate)  

---

## Phase 2 — Singapore Launch (Complete)

✅ 19 Singapore planning districts added to DB + scraper  
✅ City toggle on map (Taipei / Singapore)  
✅ 14 store categories (from 5 → 14)  
✅ Signal Intelligence panel (per-category BI tooltip)  
✅ Dead Zone concept documented and visualized  
✅ Singapore as default city across all pages  

---

## Phase 3 — Consulting & Pitch (Complete)

✅ Investor pitch page (`/pitch`) with live animated stats  
✅ `/api/pitch-stats` live counts endpoint  
✅ B2B landing page (`/intro`) with Singapore copy  
✅ Store Intelligence Matrix documented (core IP)  
✅ Business model defined (4 tiers, SGD pricing)  

---

## Phase 4 — Discover + Local Intelligence (Complete)

✅ `/discover` page — Hawker Rankings + MRT & Malls tabs  
✅ `/api/hawker-rank` — ranked by Google review count  
✅ `/api/mrt-malls` — proximity search with Haversine  
✅ 25 MRT stations hardcoded with line info  
✅ Consulting insight card (zone classification from mall count)  
✅ `shopping_mall` as 14th category  

---

## Phase 5 — Data Quality + Enrichment (Next)

📋 **Social signal enrichment** — scrape Instagram/TikTok mention counts per district  
📋 **Government data reconciliation** — cross-reference ACRA BizFile CSV with Supabase  
📋 **Automated closure detection** — weekly Google Places status check for all active stores  
📋 **Founded date backfill** — run `update_founded_dates.py` on all SG stores  
📋 **`district-signals` API** — automated Coffee:Convenience ratio + zone classification  
📋 **Dead zone heatmap overlay** — visual red cluster layer on map for closure hotspots  

---

## Phase 6 — Self-Serve SaaS (Q3 2026)

📋 **Stripe payment integration** — Tier 1 district brief ($49 one-time)  
📋 **PDF report generation** — auto-generate consulting brief as downloadable PDF  
📋 **User accounts** — email signup, saved searches, report history  
📋 **Waitlist / CTA capture** — convert landing page visitors to leads  
📋 **District comparison view** — side-by-side signal matrix for 2 districts  

---

## Phase 7 — City Expansion (Q4 2026)

📋 **Kuala Lumpur** — 15 key districts, same pipeline  
📋 **Bangkok** — 12 districts, TH-specific categories (BTS anchors)  
📋 **Jakarta** — 10 districts (Sudirman, Semanggi, Kemang, etc.)  

Each city adds ~2 weeks of work:
1. Define district dict with lat/lng
2. Run seeding for all 14 categories
3. Add city config to map page
4. Update pitch deck TAM numbers

---

## Phase 8 — Enterprise / Franchise (2027)

💡 **Chain rollout feasibility report** — optimal next 3 locations for a retail chain  
💡 **Franchise territory analysis** — non-overlapping coverage optimization  
💡 **Property developer partnership** — pre-development retail mix advisory  
💡 **API access tier** — white-label data access for proptech platforms  

---

## Immediate Priorities (Next Sprint)

1. Seed Singapore shopping mall data: `python3 scripts/fetch/fetch_places.py --city singapore --category "shopping mall"`
2. Run full Singapore seed for all 14 categories
3. ACRA BizFile CSV import for closure reconciliation
4. `district-signals` API for automated zone classification
5. Stripe waitlist CTA on `/intro` and `/pitch`

---

## Tech Debt

- `pages/request.tsx` — placeholder page, needs real district analysis UI
- `pages/about.tsx` — not yet built
- `pages/admin/` — admin panel needs rate limiting
- Social signals (`enrich_social_signals.py`) — needs PTT/Instagram API keys
- Materialized views — need scheduled refresh (currently manual)
