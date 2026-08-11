/**
 * MCP server exposing live hotel search over stdio.
 *
 * Runs as a child process of the Express server, which passes LITEAPI_KEY
 * through the spawn environment. Nothing here is reachable from the browser.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchHotels, defaultDates } from './liteapi.js';

export const SUPPORTED_CITIES = ['Jaipur', 'Chandigarh', 'Amritsar', 'Mumbai', 'Shimla'];

// The model reads this to decide whether to call the tool at all, so the
// boundaries matter as much as the capability. Note the substitution rule:
// an enum can reject "Delhi", but it cannot stop the model silently searching
// Jaipur instead — only this text can.
const DESCRIPTION = `Search live hotel availability and nightly prices for a city over a specific
date range, using real inventory from the LiteAPI travel API.

ALWAYS call this tool for any question about accommodation — hotels, hostels,
guesthouses, homestays, resorts, where to stay, where to sleep, where to book.

This applies even when the user gives no dates, states no budget, and never
mentions price. "Where should I stay", "any good hotels", "where to sleep in
Jaipur", "recommend somewhere to stay" and "which area should I stay in" all
require this tool. Accommodation is never answered from local data alone: the
curated list has no availability and no prices, so answering from it would
mean inventing both.

Supported cities are exactly: Jaipur, Chandigarh, Amritsar, Mumbai, Shimla.
If the user asks about any other city, do NOT call this tool at all. Tell them
the app currently covers only those five cities. Never call this tool with a
substitute city: do not map an unsupported city to the nearest, largest, or
most similar supported one, and do not guess which supported city the user
might have meant. Asking about Delhi is not a reason to search Jaipur.

Do NOT call this for questions that are not about accommodation. Sights, food
and drink, and the character of a neighbourhood as a place to spend time are
answered from the app's curated place data. "What should I see", "where do I
eat near Hawa Mahal" and "which area is nicest to wander around" need no tool
call. The exclusion is limited to those; it never covers accommodation. If a
question asks where to sleep or book in any form, the paragraph above wins.

Dates: if the user names dates, pass them through exactly as given. If the
user gives no dates, omit checkIn and checkOut — the tool then defaults to a
two-night stay about two weeks out, a sensible near-term default for trip
planning.

An empty hotels array is a real and meaningful answer: it means no
availability was returned for those exact dates. It is not an error and not a
prompt to retry. Report it plainly, never substitute different dates, and
never fill the gap with hotels you recall independently of this tool.`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const server = new McpServer({ name: 'mcp-hotels', version: '1.0.0' });

server.registerTool(
  'search_hotels',
  {
    title: 'Search live hotel availability',
    description: DESCRIPTION,
    inputSchema: {
      city: z.enum(SUPPORTED_CITIES).describe('One of the five supported cities. Never substitute.'),
      checkIn: z.string().regex(ISO_DATE).optional().describe('YYYY-MM-DD. Omit to use the default window.'),
      checkOut: z.string().regex(ISO_DATE).optional().describe('YYYY-MM-DD. Omit to use the default window.'),
      adults: z.number().int().min(1).max(8).optional().describe('Number of adults. Defaults to 2.'),
    },
  },
  async ({ city, checkIn, checkOut, adults = 2 }) => {
    // Dates are defaulted only when BOTH are absent. A user-supplied range is
    // passed through untouched, even if it turns out to have no availability.
    const defaulted = !checkIn && !checkOut;
    const dates = defaulted ? defaultDates() : { checkIn, checkOut };

    if (!dates.checkIn || !dates.checkOut) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Provide both checkIn and checkOut, or neither.' }],
      };
    }

    try {
      const { hotels } = await searchHotels({ city, adults, ...dates });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              city,
              checkIn: dates.checkIn,
              checkOut: dates.checkOut,
              adults,
              defaultedDates: defaulted,
              count: hotels.length,
              hotels,
            }),
          },
        ],
      };
    } catch (err) {
      // A genuine upstream failure — distinct from "no hotels available",
      // which is a successful search returning an empty list.
      return {
        isError: true,
        content: [{ type: 'text', text: `Hotel search failed: ${err.message}` }],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
