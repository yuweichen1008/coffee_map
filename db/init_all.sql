-- Combined initialization SQL for Coffee Map MVP
-- This file merges schema creation, seed data, and spatial updates.

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists postgis;

-- Categories (simple lookup)
create table if not exists public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  created_at timestamptz default now()
);

-- Places ingested from Google or seeds
create table if not exists public.places (
  id uuid default gen_random_uuid() primary key,
  google_place_id text,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  category text,
  zipcode text,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (google_place_id, name, lat, lng)
);

-- Add location geometry column if missing
alter table public.places add column if not exists location geometry(Point, 4326);

-- Update the new location column with existing lat/lng
update public.places set location = ST_SetSRID(ST_MakePoint(lng, lat), 4326) where lat is not null and lng is not null;

-- Create spatial index if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'places_location_idx' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE INDEX places_location_idx ON public.places USING GIST (location)';
  END IF;
END$$;

-- Create a function to find nearby places
CREATE OR REPLACE FUNCTION public.find_places_nearby(lat float, lng float, radius integer)
RETURNS SETOF public.places AS $$
  SELECT *
  FROM public.places
  WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326),
    radius
  );
$$ LANGUAGE sql;

-- Reports table for user reports
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  place_id uuid,
  details text,
  points int default 0,
  created_at timestamptz default now()
);

-- Track user points
create table if not exists public.user_points (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  points int default 0,
  updated_at timestamptz default now()
);

-- Minimal sample data for categories and places
insert into public.categories (name, description)
  values ('cafe', 'Cafe / coffee shop')
  on conflict (name) do nothing;

insert into public.places (name, lat, lng, category, zipcode, source)
  values ('Sunny Coffee (seed)', 25.0549, 121.5255, 'cafe', '104', 'seed')
  on conflict (google_place_id, name, lat, lng) do nothing;
