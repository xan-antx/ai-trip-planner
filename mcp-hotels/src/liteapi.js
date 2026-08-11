/**
 * LiteAPI access. The API key lives here, on the MCP server side of the
 * boundary — it is passed in via the environment when the Express server
 * spawns this process, and never appears in anything returned to a client.
 */

const BASE = 'https://api.liteapi.travel/v3.0';
const REQUEST_TIMEOUT_MS = 20000;
const HOTEL_POOL = 60; // static hotels to price per search; rates calls are the slow part
const MAX_RESULTS = 10;

if (!process.env.LITEAPI_KEY) {
  throw new Error('LITEAPI_KEY is not set — the Express server must pass it through when spawning this process');
}

const headers = {
  'X-API-Key': process.env.LITEAPI_KEY,
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { ...options, headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`LiteAPI ${path} responded ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`LiteAPI ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Two nights, starting about two weeks out.
 *
 * ~2 weeks is the sensible "soon" default for trip planning — it is NOT a
 * workaround for sparse data. Measured sandbox coverage is essentially flat
 * across horizons (Shimla returns 173 / 154 / 137 hotels at 2 / 5 / 10 weeks),
 * so this default is a product choice, not a data constraint.
 */
export function defaultDates(now = new Date()) {
  const checkIn = new Date(now);
  checkIn.setDate(checkIn.getDate() + 14);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { checkIn: iso(checkIn), checkOut: iso(checkOut) };
}

/** Cheapest total rate across a hotel's room types, or null if none priced. */
function cheapestRate(entry) {
  let best = null;
  for (const rt of entry.roomTypes ?? []) {
    for (const rate of rt.rates ?? []) {
      const price = rate.retailRate?.total?.[0];
      if (!price?.amount) continue;
      if (!best || price.amount < best.amount) {
        best = { amount: price.amount, currency: price.currency, room: rate.name ?? null };
      }
    }
  }
  return best;
}

/**
 * Search hotels with live rates for a city and date range.
 * Returns { hotels, checkIn, checkOut } — an empty hotels array is a valid,
 * meaningful result and is never disguised as an error.
 */
export async function searchHotels({ city, checkIn, checkOut, adults = 2 }) {
  const staticData = await request(
    `/data/hotels?countryCode=IN&cityName=${encodeURIComponent(city)}&limit=${HOTEL_POOL}`
  );
  const hotels = staticData.data ?? [];
  if (hotels.length === 0) return { hotels: [], checkIn, checkOut };

  const byId = new Map(hotels.map((h) => [h.id, h]));
  const rated = await request('/hotels/rates', {
    method: 'POST',
    body: JSON.stringify({
      hotelIds: hotels.map((h) => h.id),
      occupancies: [{ adults }],
      currency: 'USD',
      guestNationality: 'US',
      checkin: checkIn,
      checkout: checkOut,
    }),
  });

  const results = [];
  for (const entry of rated.data ?? []) {
    const price = cheapestRate(entry);
    if (!price) continue;
    const h = byId.get(entry.hotelId) ?? {};
    results.push({
      name: h.name ?? entry.hotelId,
      stars: h.stars ?? null,
      address: h.address ?? null,
      lat: h.latitude ?? null,
      lng: h.longitude ?? null,
      pricePerStay: price.amount,
      currency: price.currency,
      room: price.room,
    });
  }

  results.sort((a, b) => a.pricePerStay - b.pricePerStay);
  return { hotels: results.slice(0, MAX_RESULTS), checkIn, checkOut };
}
