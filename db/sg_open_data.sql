-- sg_open_data.sql — tables for newly registered businesses, SFA licenses, and population density
-- Run: docker-compose exec -T db psql -U storepulse storepulse < db/sg_open_data.sql

-- ── Newly registered businesses from ACRA (trend signal) ─────────────────────
-- Populated by: scripts/fetch/fetch_new_businesses.py
CREATE TABLE IF NOT EXISTS sg_new_businesses (
    id               SERIAL PRIMARY KEY,
    uen              TEXT UNIQUE,
    entity_name      TEXT NOT NULL,
    ssic_code        TEXT,
    ssic_description TEXT,
    category         TEXT,              -- mapped from ssic: cafe | restaurant | retail | gym | etc.
    reg_date         DATE,
    postal_sector    TEXT,              -- first 2 digits of SG postal code
    district         TEXT,             -- derived from postal sector
    status           TEXT DEFAULT 'active',  -- active | ceased
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sg_new_biz_reg_date_idx   ON sg_new_businesses (reg_date DESC);
CREATE INDEX IF NOT EXISTS sg_new_biz_category_idx   ON sg_new_businesses (category);
CREATE INDEX IF NOT EXISTS sg_new_biz_district_idx   ON sg_new_businesses (district);

-- ── SFA licensed food establishments ─────────────────────────────────────────
-- Populated by: scripts/fetch/fetch_sfa_licenses.py
CREATE TABLE IF NOT EXISTS sg_sfa_licenses (
    id              SERIAL PRIMARY KEY,
    license_no      TEXT UNIQUE,
    business_name   TEXT NOT NULL,
    license_type    TEXT,              -- RESTAURANT | SNACK COUNTER | EATING HOUSE | etc.
    category        TEXT,             -- mapped to our category slugs
    address         TEXT,
    postal_code     TEXT,
    district        TEXT,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    expiry_date     DATE,
    place_id        UUID REFERENCES places(id) ON DELETE SET NULL,  -- matched place if found
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sg_sfa_district_idx  ON sg_sfa_licenses (district);
CREATE INDEX IF NOT EXISTS sg_sfa_category_idx  ON sg_sfa_licenses (category);
CREATE INDEX IF NOT EXISTS sg_sfa_place_idx     ON sg_sfa_licenses (place_id) WHERE place_id IS NOT NULL;

-- ── Population density by planning area ──────────────────────────────────────
-- Populated by: scripts/fetch/fetch_population.py
CREATE TABLE IF NOT EXISTS sg_population (
    planning_area    TEXT PRIMARY KEY,
    total_residents  INTEGER,
    census_year      INTEGER DEFAULT 2020,
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Convenience view: stores per 1000 residents (underserved area signal) ────
CREATE OR REPLACE VIEW sg_area_opportunity AS
SELECT
    p.planning_area,
    pop.total_residents,
    COUNT(pl.id)                                          AS store_count,
    COUNT(pl.id) FILTER (WHERE pl.category = 'cafe')     AS cafe_count,
    COUNT(pl.id) FILTER (WHERE pl.category = 'restaurant') AS restaurant_count,
    COUNT(pl.id) FILTER (WHERE pl.category = 'hawker')   AS hawker_count,
    COUNT(pl.id) FILTER (WHERE pl.category = 'gym')      AS gym_count,
    ROUND(
        COUNT(pl.id)::numeric / NULLIF(pop.total_residents, 0) * 1000, 2
    )                                                     AS stores_per_1k_residents,
    ROUND(
        COUNT(pl.id) FILTER (WHERE pl.category = 'cafe')::numeric
        / NULLIF(pop.total_residents, 0) * 1000, 2
    )                                                     AS cafes_per_1k_residents
FROM sg_planning_areas p
LEFT JOIN sg_population pop ON LOWER(REPLACE(p.name, ' ', '_')) = LOWER(REPLACE(pop.planning_area, ' ', '_'))
LEFT JOIN places pl
    ON ST_Within(pl.location, ST_GeomFromGeoJSON(p.geojson::text))
    AND pl.city = 'singapore'
    AND pl.status = 'active'
GROUP BY p.planning_area, pop.total_residents
ORDER BY stores_per_1k_residents ASC NULLS LAST;
