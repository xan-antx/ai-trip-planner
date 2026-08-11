import { Router } from 'express';
import { query } from '../../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { generateChatReply } from '../gemini.js';
import { listTools, callTool } from '../mcp/client.js';

const router = Router();

const MAX_MESSAGE_LEN = 2000;
const MAX_DETAILED = 25; // cap context rows so the prompt can't balloon

// How far from a named place counts as "near". Tune this: 1.5km is generous in a
// dense old city, tighter (~0.8) if matched context feels too broad.
const RADIUS_KM = 1.5;
const EARTH_RADIUS_KM = 6371;

const toRadians = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two lat/lng pairs. Exported for testing. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * pg returns NUMERIC as strings to preserve precision, so lat/lng arrive as
 * e.g. "26.9239". Coerce to numbers; return null if either is absent.
 */
export function coordsOf(place) {
  if (place.lat == null || place.lng == null) return null;
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Escape a string so it can be embedded literally inside a RegExp. */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does `message` mention `entity` as whole words?
 * Word boundaries stop the Mumbai area "Fort" from matching "comfort".
 * Exported for unit testing.
 */
export function mentions(message, entity) {
  return new RegExp(`\\b${escapeRegExp(entity)}\\b`, 'i').test(message);
}

/**
 * Retrieval over a city's places:
 *   1. find rows the message names directly (by place name or area),
 *   2. expand outward from each named place.
 *
 * Expansion is by distance (everything within RADIUS_KM) when the matched place
 * has coordinates — the area column can't express proximity, e.g. Hawa Mahal is
 * in "Badi Chaupar" while the cafes facing it are in "Hawa Mahal Road".
 * Places without coordinates fall back to exact-area expansion, so cities that
 * haven't been geocoded yet behave exactly as they did before.
 *
 * Returns matched areas, the (capped) detailed rows, and the distance in km
 * from the nearest named place for each row that was reached by radius.
 * Exported for unit testing.
 */
export function retrieveContext(places, message) {
  const nameHits = [];
  const matchedAreas = new Set();

  for (const p of places) {
    if (mentions(message, p.name)) nameHits.push(p);
    if (mentions(message, p.area)) matchedAreas.add(p.area);
  }

  const nameHitIds = new Set(nameHits.map((p) => p.id));
  const distances = new Map(); // place id -> km from the nearest named place

  for (const hit of nameHits) {
    const origin = coordsOf(hit);
    if (!origin) {
      // No coordinates on this match — fall back to the old area expansion.
      matchedAreas.add(hit.area);
      continue;
    }
    for (const p of places) {
      const c = coordsOf(p);
      if (!c) continue;
      const km = haversineKm(origin.lat, origin.lng, c.lat, c.lng);
      if (km > RADIUS_KM) continue;
      const prev = distances.get(p.id);
      if (prev === undefined || km < prev) distances.set(p.id, km);
    }
  }

  const detailed = places
    .filter((p) => distances.has(p.id) || matchedAreas.has(p.area))
    .sort((a, b) => {
      // directly-named places first...
      const hitDelta = (nameHitIds.has(a.id) ? 0 : 1) - (nameHitIds.has(b.id) ? 0 : 1);
      if (hitDelta !== 0) return hitDelta;
      // ...then nearest first, with area-only matches (no distance) last.
      const aKm = distances.get(a.id);
      const bKm = distances.get(b.id);
      if (aKm !== undefined && bKm !== undefined) return aKm - bKm;
      if (aKm !== undefined) return -1;
      if (bKm !== undefined) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_DETAILED);

  return { matchedAreas: [...matchedAreas], detailed, distances };
}

function buildPrompt(cityName, places, detailed, message, distances = new Map()) {
  // Compact index of EVERY place — always included, so the model knows exactly
  // what exists locally and can't pass off an invented place as one of ours.
  const index = places
    .map((p) => `- ${p.name} · ${p.category} · ${p.area}`)
    .join('\n');

  const detailedBlock = detailed.length
    ? detailed
        .map((p) => {
          const price = p.price_level ? ` [${p.price_level}]` : '';
          const km = distances.get(p.id);
          const near = km === undefined ? '' : ` [${km.toFixed(2)} km away]`;
          return `- ${p.name} (${p.category}, ${p.area})${price}${near}: ${p.description}`;
        })
        .join('\n')
    : 'None matched — answer from the index above and your own general knowledge.';

  const systemInstruction = [
    `You are a local travel assistant for ${cityName}.`,
    'You are given a LOCAL INDEX of places from our database (name · category · area),',
    'and, when relevant, DETAILED ENTRIES with descriptions and price levels.',
    'Give concise, practical recommendations.',
    'Rules:',
    '1. Never invent a place and present it as being from our local list. If you suggest',
    '   somewhere that is not in the index, make clear it is a general suggestion.',
    '2. Prefer the DETAILED ENTRIES when they fit the question.',
    '3. You may also use your own general knowledge of the city.',
    '4. Live hotel prices and availability come only from the search_hotels tool. If it',
    '   returns no hotels, say plainly that none were available for those dates — do not',
    '   retry with different dates, and do not name hotels you half-remember as if they',
    '   were live results. The same honesty rule as (1), applied to hotels.',
  ].join('\n');

  const userPrompt = [
    `City: ${cityName}`,
    '',
    `LOCAL INDEX (all ${places.length} places in our database for ${cityName}):`,
    index,
    '',
    'DETAILED ENTRIES (most relevant to the question):',
    detailedBlock,
    '',
    `User question: ${message}`,
  ].join('\n');

  return { systemInstruction, userPrompt };
}

// POST /api/chat  — body: { cityId, message }
router.post('/', requireAuth, async (req, res, next) => {
  const cityId = Number(req.body?.cityId);
  if (!Number.isInteger(cityId) || cityId < 1) {
    return res.status(400).json({ error: 'cityId must be a positive integer' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: `message must be at most ${MAX_MESSAGE_LEN} characters` });
  }

  try {
    const cityResult = await query('SELECT id, name FROM cities WHERE id = $1', [cityId]);
    const city = cityResult.rows[0];
    if (!city) return res.status(404).json({ error: 'City not found' });

    const { rows: places } = await query(
      `SELECT id, category, name, area, description, price_level, lat, lng
         FROM places
        WHERE city_id = $1
        ORDER BY category, name`,
      [cityId]
    );

    const { matchedAreas, detailed, distances } = retrieveContext(places, message);
    const { systemInstruction, userPrompt } = buildPrompt(
      city.name,
      places,
      detailed,
      message,
      distances
    );

    // Tool access is best-effort: if the MCP server can't start, the chatbot
    // still answers from local context exactly as it did in Phase 3.
    let tools;
    try {
      tools = await listTools();
    } catch (err) {
      console.error('MCP unavailable, continuing without tools:', err.message);
    }

    let reply;
    let toolCalls = [];
    try {
      ({ text: reply, toolCalls } = await generateChatReply({
        systemInstruction,
        userPrompt,
        tools,
        executeTool: tools ? callTool : undefined,
      }));
    } catch (err) {
      // Clear upstream error — never a silent empty 200.
      return res
        .status(err.status || 502)
        .json({ error: err.clientMessage || 'The AI service is currently unavailable.' });
    }

    res.json({
      city,
      reply,
      hotelSearch: toolCalls
        .filter((c) => c.name === 'search_hotels')
        .map(({ args, result }) => ({
          args,
          checkIn: result?.checkIn ?? null,
          checkOut: result?.checkOut ?? null,
          defaultedDates: result?.defaultedDates ?? null,
          count: result?.count ?? 0,
          hotels: result?.hotels ?? [],
          error: result?.error ?? null,
        })),
      context: {
        matchedAreas,
        radiusKm: RADIUS_KM,
        places: detailed.map(({ id, name, category, area, price_level }) => ({
          id,
          name,
          category,
          area,
          price_level,
          // null when reached by area fallback rather than radius
          distanceKm: distances.has(id) ? Number(distances.get(id).toFixed(3)) : null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
