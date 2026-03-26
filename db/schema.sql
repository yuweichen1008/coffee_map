CREATE TABLE places (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  google_place_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE places ADD COLUMN type TEXT;

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add a geometry column to the places table
ALTER TABLE places ADD COLUMN location geometry(Point, 4326);

-- Update the new location column with the existing lat/lng data
UPDATE places SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326);

-- Create a spatial index on the location column
CREATE INDEX places_location_idx ON places USING GIST (location);

-- Create a function to find nearby places
CREATE OR REPLACE FUNCTION find_places_nearby(lat float, lng float, radius integer)
RETURNS SETOF places AS $$
  SELECT *
  FROM places
  WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326),
    radius
  );
$$ LANGUAGE sql;