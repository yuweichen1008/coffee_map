-- Minimal Supabase schema for Coffee Map MVP
-- Run this in Supabase SQL editor or psql against your database

-- enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- categories table
create table if not exists public.categories (
  name text primary key
);

-- places table: stores both crawled Google Places and user-submitted
create table if not exists public.places (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  lat double precision,
  lng double precision,
  category text,
  zipcode text,
  source text,
  created_at timestamptz default now()
);

-- reports table for user reports
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  name text,
  lat double precision,
  lng double precision,
  reported_by text,
  created_at timestamptz default now()
);

-- user points
create table if not exists public.user_points (
  user_id text primary key,
  points integer default 0,
  updated_at timestamptz default now()
);

-- Seed categories
insert into public.categories (name) values
('cafe'), ('restaurant'), ('bakery'), ('米漢堡')
on conflict (name) do nothing;

-- Seed a few places in Zhongshan for testing
insert into public.places (name, lat, lng, category, zipcode, source) values
('Sunny Coffee (seed)', 25.0549, 121.5255, 'cafe', '104', 'seed'),
('Morning Bites (seed)', 25.0555, 121.5265, '米漢堡', '104', 'seed'),
('Zhongshan Bakery (seed)', 25.0535, 121.5240, 'bakery', '104', 'seed');
