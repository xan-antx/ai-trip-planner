import { Router } from 'express';
import { query } from '../../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

export const CATEGORIES = ['tourist_spot', 'stay', 'restaurant', 'cafe'];

// GET /api/cities
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name FROM cities ORDER BY name');
    res.json({ cities: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/cities/:cityId/places[?category=]
router.get('/:cityId/places', requireAuth, async (req, res, next) => {
  const cityId = Number(req.params.cityId);
  if (!Number.isInteger(cityId) || cityId < 1) {
    return res.status(400).json({ error: 'cityId must be a positive integer' });
  }

  const { category } = req.query;
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `category must be one of: ${CATEGORIES.join(', ')}`,
    });
  }

  try {
    const cityResult = await query('SELECT id, name FROM cities WHERE id = $1', [cityId]);
    const city = cityResult.rows[0];
    if (!city) return res.status(404).json({ error: 'City not found' });

    const { rows: places } = await query(
      `SELECT id, category, name, area, description, price_level
         FROM places
        WHERE city_id = $1
          AND ($2::text IS NULL OR category = $2)
        ORDER BY category, name`,
      [cityId, category ?? null]
    );

    // Always return every requested category as a key, so the client can render
    // an empty state without special-casing a missing group.
    const wanted = category ? [category] : CATEGORIES;
    const grouped = Object.fromEntries(wanted.map((c) => [c, []]));
    for (const place of places) grouped[place.category].push(place);

    res.json({ city, total: places.length, placesByCategory: grouped });
  } catch (err) {
    next(err);
  }
});

export default router;
