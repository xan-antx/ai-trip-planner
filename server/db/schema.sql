-- AI Trip Planner — Phase 1 schema
-- Safe to re-run: every statement is guarded.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cities (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS places (
  id          SERIAL PRIMARY KEY,
  city_id     INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('tourist_spot', 'stay', 'restaurant', 'cafe')),
  name        TEXT NOT NULL,
  area        TEXT NOT NULL,
  description TEXT NOT NULL,
  price_level TEXT CHECK (price_level IN ('budget', 'mid', 'premium')),
  -- lets the seed script upsert instead of duplicating
  UNIQUE (city_id, category, name)
);

-- Phase 2 will filter by city + category constantly.
CREATE INDEX IF NOT EXISTS places_city_category_idx ON places (city_id, category);

-- Phase 3: coordinates for distance-based "near X" retrieval. Nullable — only
-- Jaipur is populated so far; cities without coordinates fall back to matching
-- on the area column.
ALTER TABLE places ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE places ADD COLUMN IF NOT EXISTS lng NUMERIC;
