# Store Intelligence Matrix — StorePulse Core IP

## What It Is

The Store Intelligence Matrix is StorePulse's proprietary analytical framework. Each store category is a **proxy signal for a demographic or economic condition**. Counting stores by type reveals what kind of people live and work in an area — and what businesses are likely to succeed there.

This is the core moat. No competitor has documented cross-category signal logic. It becomes the backbone of every consulting deliverable.

---

## The 14-Category Signal Matrix

| Category | DB Slug | Signal Type | What High Density Means | Business Implication |
|---|---|---|---|---|
| Coffee Shop | `cafe` | Knowledge worker / office density | Commercial hub, daytime workers | B2B services, co-working, premium lunch |
| Convenience Store | `convenience_store` | Residential population proxy | Dense residential estate | FMCG, last-mile, family services |
| Grocery Store | `grocery` | Residential self-sufficiency | Large, self-contained catchment | Underserved estate = supply gap |
| Restaurant | `restaurant` | Evening economy / entertainment | Night economy zone | Nightlife adjacent, weekend foot traffic |
| Bakery | `bakery` | Gentrification index | Boutique opening = area upgrading | Rent rising within 12 months |
| Beverage / Boba | `beverage_store` | Youth + impulse foot traffic | Near school or MRT, high throughput | Price-sensitive crowd, high velocity |
| Hawker Centre | `hawker` | Blue-collar workforce / lunch demand | Value F&B captive trade | Absence in dense area = premium or gap |
| Supermarket | `supermarket` | Residential income bracket | Cold Storage = premium; NTUC = mass | Income segmentation signal |
| Pharmacy | `pharmacy` | Aging or family demographic | Healthcare-adjacent demand | Wellness retail, polyclinic proximity |
| Gym / Fitness | `gym` | Young professional concentration | Active lifestyle, disposable income | Premium services, health food |
| Co-working | `coworking` | Startup / remote-worker zone | Tech and knowledge economy | SaaS, B2B tools, productivity services |
| Childcare / Tuition | `childcare` | Families with young children | Education demand, parenting retail | Enrichment, family dining |
| Laundromat | `laundromat` | Rental-heavy / transient population | Migrant workers, budget renters | Budget services; avoid premium positioning |
| Shopping Mall | `shopping_mall` | Foot traffic anchor / retail magnet | Strong pedestrian catchment | Premium rent zone, captive shoppers |

---

## Cross-Signal Combos (Consulting Deliverables)

These ratios and combinations form the basis of consulting reports. Each is a pattern that can be detected automatically from store density data.

### Zone Classification Combos

| Signal Combination | Zone Type | Business Recommendation |
|---|---|---|
| High cafe + Low convenience | Pure CBD | Office-focused services; no night economy |
| High convenience + High childcare | Family heartland | Education, parenting retail, family dining |
| High cafe + High coworking + High boba | Startup district | Tech services, B2B tools, co-working expansion |
| High hawker + High laundromat | Migrant worker zone | Budget F&B; avoid premium or luxury |
| High pharmacy + Rising childcare | Dual-generation estate | Healthcare + education adjacent opportunity |
| High restaurant + High beverage_store | Night economy zone | Evening economy anchored, weekend footfall |
| Zero coffee shops in new HDB BTO | Supply gap | 3-year window before rents spike |
| Mall cluster within 500m of MRT | Premium retail corridor | Captive catchment; MRT exit count matters more than distance |

### The Coffee:Convenience Ratio

```
coffee_count / convenience_count

> 2.0  →  Dominant office/commercial zone
1.0–2.0 → Mixed use (office + residential)
0.5–1.0 → Residential with commercial activity
< 0.5   → Pure residential heartland
```

### The Gentrification Index

```
bakery_count / kopitiam_count (mapped as hawker)

Rising ratio over time → Area is upgrading (boutique displacing traditional)
Stable low ratio       → Established stable residential
Spike then plateau     → Gentrification completed, rents already elevated
```

### Dead Zone Risk Score (unique to StorePulse)

```
closed_last_3yrs / (closed_last_3yrs + active)

> 30%  →  High risk zone (flood, rent spike, or demand collapse)
15–30% →  Moderate risk (post-COVID recovery, re-entry opportunity)
< 15%  →  Healthy churn (normal business turnover)
```

---

## Singapore-Specific Signal Interpretations

| Observation | What It Means |
|---|---|
| HDB void deck coffee shop | Captive residential, low-margin, high-volume |
| Cold Storage / Jason's Deli cluster | Premium income bracket (expat or high-earner zone) |
| NTUC FairPrice cluster | Mass-market income bracket, HDB majority |
| High Guardian/Watsons density | Young female professional or aging population |
| Kopitiam cluster | Blue-collar workforce, value F&B, lunch trade |
| Trendy café cluster + coworking near MRT | Startup district emerging |
| Zero cafes in new BTO | 3-year supply gap opportunity |
| Clinic + pharmacy cluster | Near polyclinic or aging estate |
| Mall cluster at MRT interchange | Captive shoppers — Jurong East, Tampines, Serangoon patterns |
| High laundromat + hawker density | Dormitory zone (Woodlands, Jurong Industrial) — avoid luxury |

---

## How to Run a Signal Analysis (Manual Workflow)

1. Open `/map`, select Singapore
2. Toggle categories one at a time for the target district
3. Note which categories show high density clusters vs gaps
4. Cross-reference with the combos table above
5. Check `/time-machine` for historical trend (opening/closing velocity)
6. Check dead zone clusters (red circles on map) for risk areas
7. Document findings as a district brief (Tier 1 deliverable, SGD 300–500)

---

## Automated Signal Scoring (Future)

Planned `/api/district-signals` endpoint:
```json
{
  "district": "Tanjong_Pagar",
  "signals": {
    "coffee_convenience_ratio": 2.4,
    "zone_type": "CBD dominant",
    "gentrification_index": 1.8,
    "dead_zone_risk": "12%",
    "supply_gaps": ["childcare", "pharmacy"],
    "oversupply": ["cafe", "restaurant"]
  },
  "recommendation": "B2B services, co-working, premium lunch — avoid F&B saturation"
}
```
