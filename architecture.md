The "Keep It Real" AI Trip Planner Architecture

Build status

Phase 0 — Scaffold: done. Vite + React client, Express server, GET /api/health.
Phase 1 — Database + auth: done. Schema, seed data, signup/login/JWT.
Phase 2 — City and places UI: not started.
Phase 3 — Gemini chatbot: not started.
Phase 4 — Amadeus MCP server + client: not started.

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
- places — id, city_id (FK to cities), category, name, area, description, price_level.

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
The area column is the useful join here: a question naming a place can be matched to its area, and
everything else in that area pulled in as context.

Authentication

POST /api/auth/signup — email + password, hashed with bcrypt (12 rounds), returns a JWT.
POST /api/auth/login — verifies credentials, returns a JWT. Returns an identical error for an unknown
email and a wrong password, so the endpoint cannot be used to enumerate accounts.
GET /api/auth/me — example protected route.
Protected routes use the requireAuth middleware in server/src/middleware/auth.js, which expects an
Authorization: Bearer <token> header.

The MCP Architecture

1. The MCP Server: You will build your own MCP server that wraps the Amadeus Self-Service API,
   exposing live flight and hotel search as MCP tools. Amadeus is the live-data provider throughout.
2. The Backend Client: You will configure an MCP Client inside your Node.js/Express server, pointed at
   that MCP server. Amadeus credentials (AMADEUS_API_KEY / AMADEUS_API_SECRET, already in
   server/.env.example) stay on the MCP server side and are never exposed to the frontend.
3. The AI Agent Flow: When a user asks your React frontend, "Find a hotel in Jaipur," your Node.js server passes that prompt to the Gemini API. Gemini recognizes it needs live data, automatically calls the Amadeus MCP server to get the real-time prices, and then formats a perfect response to send back to the user.

Writing the MCP server yourself is more work than plugging into someone else's, but it is also the part
worth demoing: it shows you understand the protocol rather than just consuming it. Start with the
Amadeus test environment, which issues free credentials against sandbox data.
