The "Keep It Real" AI Trip Planner Architecture

Build status

Phase 0 — Scaffold: done. Vite + React client, Express server, GET /api/health.
Phase 1 — Database + auth: done. Schema, seed data, signup/login/JWT.
Phase 2 — City and places UI: done. GET /api/cities and GET /api/cities/:cityId/places
  (optional ?category= filter), plus a React client with JWT login/signup, a city list,
  and a per-city view with the four categories as tabs.
Phase 3 — Gemini chatbot: done. POST /api/chat — distance-based retrieval over the
  places table (radius expansion from any named place, exact-area fallback where
  coordinates are missing), plus an always-on compact index of every place in the
  city, sent to Gemini (gemini-flash-latest) as grounding.
Phase 4 — LiteAPI MCP server + client: done. /mcp-hotels exposes search_hotels over stdio;
  the Express server drives it as an MCP client so Gemini can call it. (Amadeus was
  decommissioned 17 July 2026; see the MCP Architecture section.)

1. Drop the Complex Vector Databases (RAG)

Do not attempt to build a Retrieval-Augmented Generation (RAG) system using pgvector for PostgreSQL.
Maintaining a separate Vector database is too complex and unnecessary for the scope of this project.
If you cannot successfully connect to a live travel company API (like MakeMyTrip), simply fall back to calling the Gemini API directly.
As your friend pointed out, interviewers will not expect a second-year student to have a production-grade RAG system; they just want to see a working full-stack application.

Keep the Scope Limited and Hardcoded

Start by forcing the user to sign up and log in.
This simple authentication step is crucial because it easily proves to the interviewer that you know how to handle and update a database.
Hardcode a fixed set of cities in the database rather than trying to map the whole world.
The build ships five: Jaipur, Chandigarh, Amritsar, Mumbai, and Shimla — chosen over the original three because they are regional routes that are easy to sanity-check by hand.

The Data Model

Three tables, defined in server/db/schema.sql:

- users — id, email (unique), password_hash, created_at.
- cities — id, name.
- places — id, city_id (FK to cities), category, name, area, description, price_level,
  lat, lng (both nullable; Jaipur only so far).

Everything a city contains lives in the single places table, distinguished by a category column
constrained to 'tourist_spot', 'stay', 'restaurant', or 'cafe'. One table rather than four keeps the
schema normalized and means a fifth category later is a data change, not a migration.
price_level ('budget' / 'mid' / 'premium') is nullable — it is set for stays, restaurants and cafes,
and left null for tourist spots.

A UNIQUE (city_id, category, name) constraint lets the seed script upsert, so server/db/seed.js is
safe to re-run without duplicating rows. It seeds 7 places in each of the 4 categories for each of the
5 cities: 28 per city, 140 rows total.

The Dual-UI Approach

When a user clicks on a city (e.g., Jaipur), the frontend should query the backend and display that
city's places, grouped by category.
Alongside this static data, include a text-based chatbot interface.

The AI Chatbot Workflow

When the user asks the chatbot a specific question (e.g., "Food places near Hawa Mahal"), the backend should first query your PostgreSQL database for tokens or keywords related to "Hawa Mahal".
Extract that relevant information from your database and append it as "context" to the user's prompt.
Send this combined prompt (User Question + Database Context) to the Gemini API so it can generate a highly accurate, customized response.
If the user asks for something outside your database (like "I want to eat vegan"), the Gemini API will seamlessly handle it using its own pre-trained knowledge since that data won't exist in your DB.
Retrieval works outward from any place the message names. Where the named place has coordinates,
everything within RADIUS_KM (1.5 km, a named constant in chat.js) is pulled in as context — the area
column alone cannot express proximity, since Hawa Mahal sits in "Badi Chaupar" while the cafes facing
it are filed under "Hawa Mahal Road". Cities not yet geocoded fall back to exact-area expansion.

Authentication

POST /api/auth/signup — email + password, hashed with bcrypt (12 rounds), returns a JWT.
POST /api/auth/login — verifies credentials, returns a JWT. Returns an identical error for an unknown
email and a wrong password, so the endpoint cannot be used to enumerate accounts.
GET /api/auth/me — example protected route.
Protected routes use the requireAuth middleware in server/src/middleware/auth.js, which expects an
Authorization: Bearer <token> header.

The MCP Architecture

Provider note: Amadeus Self-Service was decommissioned on 17 July 2026, so the original plan was
dead before it was built. The Booking.com Demand API was evaluated and rejected — its MCP server
authenticates via an interactive browser OAuth consent flow with no documented client_credentials
grant, and the underlying REST API needs an approved commercial partner account. LiteAPI (Nuitee)
replaced both: a static X-API-Key header, self-service sandbox signup, no browser step.

1. The MCP Server: /mcp-hotels is a standalone Node process exposing one tool, search_hotels, over
   stdio. It owns LITEAPI_KEY, which the Express server passes through the spawn environment. The
   key never appears in an HTTP response, so it cannot reach the browser.
2. The Backend Client: server/src/mcp/client.js is a lazy long-lived singleton — the child process
   spawns on first tool use (not at boot, so a broken MCP server can't stop Express starting) and is
   then reused. It caches the in-flight promise so concurrent requests don't spawn duplicate
   children, clears the cache on transport close so the next call reconnects, and is closed on
   SIGINT/SIGTERM. Tool definitions are read from the MCP server via listTools(), so the tool
   description exists in exactly one place.
3. The AI Agent Flow: a chat message goes to Gemini with the Phase 3 local context plus the tool
   declaration. Gemini decides whether live data is needed; if so the Express server executes the
   call over MCP, feeds the result back, and Gemini writes the final answer. Bounded at two tool
   rounds. Questions answerable from local data never trigger a call.

Quota note: a tool-firing chat costs TWO Gemini calls, not one — the first decides to call
search_hotels, the second writes the answer from what it returned. Free-tier limits are counted in
requests, so they bite roughly twice as fast as the number of user messages suggests. This is why
GEMINI_MODEL is pinned to gemini-flash-lite-latest: the gemini-flash-latest alias resolves to
gemini-3.6-flash, capped at 20 free requests per project per day, which is about 10 hotel questions
before the app starts returning 429. Non-hotel chats still cost one call each.

Guardrails, all three the same shape — report the limit honestly rather than substituting something
plausible:
- Unsupported city: the enum rejects it at the schema layer, and the tool description separately
  forbids substituting a supported city (an enum cannot catch Delhi -> Jaipur, since Jaipur is valid).
- Empty results: a successful search returning zero hotels is a valid answer, distinct from an
  upstream error. The model states it plainly and does not retry with different dates.
- No invention: live prices come only from the tool. Local-database hotels may be mentioned but must
  be labelled as such, never presented as live availability.

Dates: explicit dates are passed through exactly. When both are omitted the tool defaults to a
two-night stay about two weeks out — a sensible "soon" default for trip planning, not a workaround
for sparse data. Measured coverage is flat across horizons (Shimla: 173/154/137 hotels at 2/5/10
weeks out).

Writing the MCP server yourself is more work than plugging into someone else's, but it is also the part
worth demoing: it shows you understand the protocol rather than just consuming it.
