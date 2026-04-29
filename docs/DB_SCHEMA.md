# Database Schema — StorePulse

Supabase (PostgreSQL 15 + PostGIS). Schema file: `db/init_all.sql` (safe to re-run).

---

## Tables

### `places` — Core store table

```sql
id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid()
google_place_id         text        UNIQUE            -- dedup key for upserts
name                    text        NOT NULL
address                 text
district                text                          -- denormalized slug: 'Tanjong_Pagar'
zipcode                 text
lat                     double precision
lng                     double precision
location                geometry(Point, 4326)         -- PostGIS, spatially indexed
category                text                          -- slug: 'cafe', 'hawker', 'shopping_mall'
category_id             uuid        → categories.id
source                  text                          -- 'google_maps_api' | 'admin' | 'user_report'
status                  text        DEFAULT 'active'  -- 'active' | 'closed' | 'relocated'
founded_date            date
founded_date_confidence text        DEFAULT 'estimated' -- 'estimated' | 'verified' | 'unknown'
closed_date             date
rating                  real                          -- 1.0–5.0
review_count            integer
google_data             jsonb                         -- raw Google Places API response
created_at              timestamptz DEFAULT now()
updated_at              timestamptz DEFAULT now()
```

**Indexes:**
- `location` — GIST spatial index for `ST_DWithin` queries
- `category` — btree for category filter
- `district` — btree for district filter
- `status` — btree for active/closed filter
- `google_place_id` — unique, primary dedup key

---

### `categories` — Category lookup

```sql
id           uuid        PRIMARY KEY DEFAULT gen_random_uuid()
name         text        NOT NULL UNIQUE  -- slug: 'cafe', 'shopping_mall'
display_name text        NOT NULL         -- UI label: 'Coffee Shop', 'Shopping Mall'
group_name   text                         -- 'f_and_b' | 'retail' | 'services' | 'health'
icon         text                         -- icon key (future use)
description  text
created_at   timestamptz DEFAULT now()
```

**Current categories (14):**

| name | display_name | group |
|---|---|---|
| `cafe` | Coffee Shop | f_and_b |
| `convenience_store` | Convenience Store | retail |
| `grocery` | Grocery Store | retail |
| `restaurant` | Restaurant | f_and_b |
| `bakery` | Bakery | f_and_b |
| `beverage_store` | Beverage Store | f_and_b |
| `hawker` | Hawker / Food Court | f_and_b |
| `supermarket` | Supermarket | retail |
| `pharmacy` | Pharmacy | health |
| `gym` | Gym / Fitness | services |
| `coworking` | Co-working Space | services |
| `childcare` | Childcare / Tuition | services |
| `laundromat` | Laundromat | services |
| `shopping_mall` | Shopping Mall | retail |

---

### `districts` — District reference

```sql
id          uuid        PRIMARY KEY DEFAULT gen_random_uuid()
name        text        NOT NULL UNIQUE  -- 'Daan', 'Tanjong_Pagar'
name_zh     text                         -- '大安區' (Taipei only)
center_lat  double precision
center_lng  double precision
bounds      jsonb                        -- GeoJSON polygon (future)
created_at  timestamptz DEFAULT now()
```

**Current districts (31):**
- 12 Taipei: Daan, Xinyi, Wanhua, Datong, Zhongzheng, Songshan, Zhongshan, Neihu, Wenshan, Nangang, Shilin, Beitou
- 19 Singapore: Orchard, Marina_Bay, Tanjong_Pagar, Chinatown, Bugis, Novena, Queenstown, Toa_Payoh, Bishan, Tampines, Jurong_East, Woodlands, Sengkang, Punggol, Ang_Mo_Kio, Bedok, Clementi, Yishun, Serangoon

---

## Materialized Views

### `zone_density`

Aggregates store counts per district × category combination. Used for heatmap density and signal analysis.

```sql
-- Refresh after bulk inserts:
REFRESH MATERIALIZED VIEW public.zone_density;
```

Fields: `district`, `category`, `active_count`, `closed_count`, `total_count`, `avg_rating`

### `dead_zone_clusters`

Groups permanently closed stores into geographic clusters. Used to identify high-risk zones.

```sql
REFRESH MATERIALIZED VIEW public.dead_zone_clusters;
```

Fields: `cluster_center`, `radius_m`, `closure_count`, `date_range`, `dominant_category`

---

## Social Signals Table (optional — `db/add_consulting.sql`)

```sql
social_signals
  id              uuid PRIMARY KEY
  place_id        uuid → places.id
  platform        text  -- 'google' | 'instagram' | 'tiktok'
  signal_type     text  -- 'mention' | 'review' | 'post'
  sentiment       real  -- -1.0 to 1.0
  volume          integer
  captured_at     timestamptz
```

---

## Query Patterns

### Spatial bbox query (API pattern)

```sql
SELECT id, name, lat, lng, category, status, rating, review_count
FROM places
WHERE category = 'hawker'
  AND status != 'closed'
  AND lat BETWEEN $1 AND $2
  AND lng BETWEEN $3 AND $4
LIMIT 200;
```

### Top hawkers by district

```sql
SELECT name, district, rating, review_count
FROM places
WHERE category = 'hawker'
  AND status != 'closed'
  AND district = 'Tanjong_Pagar'
ORDER BY review_count DESC
LIMIT 20;
```

### Dead zone risk score for a district

```sql
SELECT
  district,
  COUNT(*) FILTER (WHERE status = 'closed' AND closed_date > NOW() - INTERVAL '3 years') AS closed_3yr,
  COUNT(*) FILTER (WHERE status = 'active') AS active,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'closed' AND closed_date > NOW() - INTERVAL '3 years')::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS risk_pct
FROM places
WHERE district = 'Orchard'
GROUP BY district;
```

### Coffee:Convenience ratio

```sql
SELECT
  district,
  COUNT(*) FILTER (WHERE category = 'cafe') AS cafe_count,
  COUNT(*) FILTER (WHERE category = 'convenience_store') AS conv_count,
  ROUND(
    COUNT(*) FILTER (WHERE category = 'cafe')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE category = 'convenience_store'), 0), 2
  ) AS coffee_conv_ratio
FROM places
WHERE status = 'active'
  AND district IN ('Tanjong_Pagar', 'Orchard', 'Novena', 'Tampines')
GROUP BY district
ORDER BY coffee_conv_ratio DESC;
```

---

## Maintenance

```sql
-- After bulk data load
REFRESH MATERIALIZED VIEW public.zone_density;
REFRESH MATERIALIZED VIEW public.dead_zone_clusters;

-- Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class WHERE relname IN ('places', 'categories', 'districts')
ORDER BY pg_total_relation_size(oid) DESC;

-- Check recent inserts
SELECT date_trunc('day', created_at) AS day, COUNT(*)
FROM places GROUP BY 1 ORDER BY 1 DESC LIMIT 14;
```
