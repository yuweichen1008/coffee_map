-- ============================================================
-- Taipei Business Map — Database Initialization
-- Run this in Supabase SQL Editor to set up the full schema.
-- Safe to re-run: uses CREATE IF NOT EXISTS / ALTER ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- categories
-- Lookup table for store types with grouping for BI queries.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text        NOT NULL UNIQUE,   -- slug: 'cafe', 'convenience_store'
  display_name text        NOT NULL,          -- UI label: 'Coffee Shop'
  group_name   text,                          -- 'f_and_b' | 'retail' | 'services'
  icon         text,                          -- icon key for frontend rendering
  description  text,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- districts
-- Taipei district reference — centers and future boundary polygons.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.districts (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL UNIQUE,  -- 'Daan', 'Xinyi', etc.
  name_zh     text,                         -- '大安區'
  center_lat  double precision,
  center_lng  double precision,
  bounds      jsonb,                        -- GeoJSON polygon for district boundary
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- places
-- Core table: stores ingested from Google Places or admin input.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.places (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  google_place_id         text        UNIQUE,          -- unique Google Place ID
  name                    text        NOT NULL,
  address                 text,
  district                text,                        -- denormalized for fast WHERE district = ?
  zipcode                 text,
  lat                     double precision,
  lng                     double precision,
  location                geometry(Point, 4326),       -- PostGIS point, spatially indexed
  category                text,                        -- denormalized slug for query convenience
  category_id             uuid        REFERENCES public.categories(id),
  source                  text,                        -- 'google_maps_api' | 'admin' | 'user_report'
  status                  text        NOT NULL DEFAULT 'active',  -- 'active' | 'closed' | 'relocated'
  founded_date            date,                        -- estimated store opening date
  founded_date_confidence text        DEFAULT 'estimated',  -- 'estimated' | 'verified' | 'unknown'
  closed_date             date,                        -- populated when status = 'closed'
  rating                  real,                        -- Google rating 1.0–5.0
  review_count            integer,                     -- number of Google reviews
  google_data             jsonb,                       -- raw Google Places API payload
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- Migrate existing rows: populate location from lat/lng if missing
UPDATE public.places
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE lat IS NOT NULL AND lng IS NOT NULL AND location IS NULL;

-- ============================================================
-- Indexes
-- ============================================================

-- Spatial index for ST_DWithin proximity queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'places_location_idx' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX places_location_idx ON public.places USING GIST (location)';
  END IF;
END$$;

-- Composite index for category + district BI queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'places_category_district_idx' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX places_category_district_idx ON public.places (category, district)';
  END IF;
END$$;

-- Index for Time Machine date-range queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'places_founded_date_idx' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX places_founded_date_idx ON public.places (founded_date)';
  END IF;
END$$;

-- ============================================================
-- find_places_nearby
-- Spatial + temporal query function used by /api/places.
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_places_nearby(
  lat          float,
  lng          float,
  radius       integer,
  p_category   text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL
)
RETURNS SETOF public.places AS $$
  SELECT *
  FROM public.places
  WHERE ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(lng, lat), 4326),
          radius
        )
    AND (p_category   IS NULL OR category     = p_category)
    AND (p_start_date IS NULL OR founded_date >= p_start_date)
    AND (p_end_date   IS NULL OR founded_date <= p_end_date)
    AND status = 'active';
$$ LANGUAGE sql;

-- ============================================================
-- zone_density (materialized view)
-- Pre-computed ~200m grid cell density per category + district.
-- Powers the heatmap without a full table scan on every request.
-- Refresh: REFRESH MATERIALIZED VIEW public.zone_density;
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.zone_density AS
SELECT
  category,
  district,
  ST_SnapToGrid(location, 0.002, 0.002) AS grid_cell,
  COUNT(*)                               AS store_count,
  AVG(rating)                            AS avg_rating,
  MIN(founded_date)                      AS oldest_store,
  MAX(founded_date)                      AS newest_store
FROM public.places
WHERE status = 'active'
  AND location IS NOT NULL
GROUP BY category, district, ST_SnapToGrid(location, 0.002, 0.002);

CREATE INDEX IF NOT EXISTS zone_density_category_idx ON public.zone_density (category);

-- ============================================================
-- reports
-- User-submitted store tips; each accepted report awards points.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid,
  place_id   uuid,
  details    text,
  points     int         DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- user_points
-- Cumulative gamification points per user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_points (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL,
  points     int         DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- Seed data — categories
-- ============================================================
INSERT INTO public.categories (name, display_name, group_name, description) VALUES
  ('cafe',               'Coffee Shop',       'f_and_b',  'Cafes and specialty coffee shops'),
  ('convenience_store',  'Convenience Store', 'retail',   '7-Eleven, FamilyMart, Hi-Life, etc.'),
  ('grocery',            'Grocery Store',     'retail',   'Supermarkets and traditional markets'),
  ('restaurant',         'Restaurant',        'f_and_b',  'Dine-in restaurants of all cuisines'),
  ('bakery',             'Bakery',            'f_and_b',  'Bread, pastry, and dessert shops'),
  ('beverage_store',     'Beverage Store',    'f_and_b',  'Boba, juice bars, and drink stands')
ON CONFLICT (name) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      group_name   = EXCLUDED.group_name,
      description  = EXCLUDED.description;

-- ============================================================
-- Seed data — districts
-- ============================================================
INSERT INTO public.districts (name, name_zh, center_lat, center_lng) VALUES
  ('Daan',       '大安區', 25.026,    121.543),
  ('Xinyi',      '信義區', 25.0348,   121.5677),
  ('Wanhua',     '萬華區', 25.026285, 121.497032),
  ('Datong',     '大同區', 25.063,    121.511),
  ('Zhongzheng', '中正區', 25.03236,  121.51827),
  ('Songshan',   '松山區', 25.055,    121.554),
  ('Zhongshan',  '中山區', 25.05499,  121.52540),
  ('Neihu',      '內湖區', 25.0667,   121.5833),
  ('Wenshan',    '文山區', 24.9897,   121.5722),
  ('Nangang',    '南港區', 25.03843,  121.621825),
  ('Shilin',     '士林區', 25.0833,   121.5170),
  ('Beitou',     '北投區', 25.1167,   121.5000)
ON CONFLICT (name) DO UPDATE
  SET name_zh    = EXCLUDED.name_zh,
      center_lat = EXCLUDED.center_lat,
      center_lng = EXCLUDED.center_lng;

-- ============================================================
-- Seed data — one sample place so the app loads without errors
-- ============================================================
INSERT INTO public.places (name, lat, lng, category, district, zipcode, source, status)
VALUES ('Sunny Coffee (seed)', 25.0549, 121.5255, 'cafe', 'Zhongshan', '104', 'seed', 'active')
ON CONFLICT (google_place_id) DO NOTHING;
