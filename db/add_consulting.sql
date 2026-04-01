-- ============================================================
-- Consulting Feature: Social Signals
-- Run this in the Supabase SQL Editor once.
-- ============================================================

-- social_signals: stores per-platform trend scores for each place
-- Scores are pre-seeded by scripts/seed_social_signals.py
-- No live API calls at query time — all data is cached in this table.

CREATE TABLE IF NOT EXISTS public.social_signals (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      uuid    NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  platform      text    NOT NULL
    CHECK (platform IN ('instagram','tiktok','facebook','threads','line')),
  score         integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  mention_count integer,
  source        text    DEFAULT 'seed',  -- 'seed' | 'manual' | 'api'
  last_updated  timestamptz DEFAULT now()
);

-- Unique: one score per (place, platform)
CREATE UNIQUE INDEX IF NOT EXISTS social_signals_place_platform_uniq
  ON public.social_signals (place_id, platform);

-- Fast lookup by place
CREATE INDEX IF NOT EXISTS social_signals_place_idx
  ON public.social_signals (place_id);

-- Fast filtering by score (for min_score slider)
CREATE INDEX IF NOT EXISTS social_signals_score_idx
  ON public.social_signals (score DESC);

-- Fast filtering by platform
CREATE INDEX IF NOT EXISTS social_signals_platform_idx
  ON public.social_signals (platform);
