-- Singapore public data enrichment schema
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.
-- Run order: after init_all.sql (02_sg.sql in docker-compose)

-- ── 1. Augment places table with SG government data columns ──────────────────

ALTER TABLE places ADD COLUMN IF NOT EXISTS acra_uen        TEXT;
ALTER TABLE places ADD COLUMN IF NOT EXISTS acra_reg_date   DATE;
ALTER TABLE places ADD COLUMN IF NOT EXISTS acra_cease_date DATE;
ALTER TABLE places ADD COLUMN IF NOT EXISTS nea_grade       CHAR(1);    -- 'A', 'B', 'C'
ALTER TABLE places ADD COLUMN IF NOT EXISTS nea_inspected   DATE;
ALTER TABLE places ADD COLUMN IF NOT EXISTS bus_stops_400m  SMALLINT;   -- count within 400m
ALTER TABLE places ADD COLUMN IF NOT EXISTS data_sources    TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS places_acra_uen_idx  ON places (acra_uen) WHERE acra_uen IS NOT NULL;
CREATE INDEX IF NOT EXISTS places_nea_grade_idx ON places (nea_grade) WHERE nea_grade IS NOT NULL;

-- ── 2. Official Singapore hawker centres (data.gov.sg) ───────────────────────

CREATE TABLE IF NOT EXISTS sg_hawker_centres (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  address     TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  location    GEOMETRY(Point, 4326),
  stall_count INT,
  place_id    UUID REFERENCES places(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sg_hawker_centres_location_idx ON sg_hawker_centres USING GIST (location);
CREATE INDEX IF NOT EXISTS sg_hawker_centres_name_idx     ON sg_hawker_centres (name);

-- ── 3. LTA bus stops — foot traffic proxy ────────────────────────────────────

CREATE TABLE IF NOT EXISTS sg_bus_stops (
  stop_code   VARCHAR(10) PRIMARY KEY,
  road_name   TEXT,
  description TEXT,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  location    GEOMETRY(Point, 4326),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sg_bus_stops_location_idx ON sg_bus_stops USING GIST (location);

-- ── 4. OneMap planning area polygons ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sg_planning_areas (
  name       TEXT PRIMARY KEY,
  geojson    JSONB NOT NULL,
  area_sqkm  DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 5. HDB resale price medians by town ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS sg_hdb_prices (
  town             TEXT    PRIMARY KEY,
  median_price_sgd INT,
  sample_count     INT,
  year             SMALLINT,
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── 6. Helper: update bus_stops_400m for all Singapore places ────────────────
-- Call after populating sg_bus_stops:
--
--   UPDATE places
--   SET bus_stops_400m = (
--     SELECT COUNT(*)::smallint
--     FROM sg_bus_stops
--     WHERE ST_DWithin(sg_bus_stops.location::geography, places.location::geography, 400)
--   )
--   WHERE lat BETWEEN 1.15 AND 1.48  -- Singapore latitude band
--     AND lng BETWEEN 103.6 AND 104.1;
