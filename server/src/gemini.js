import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

// Fail loudly at import time if the key is missing — same contract as db/pool.js,
// so the server won't boot half-configured.
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set — copy server/.env.example to server/.env');
}

// Floating alias, so a retired version can't break the app (as gemini-2.5-flash
// did). The *lite* alias is the fallback because the plain gemini-flash-latest
// resolves to gemini-3.6-flash, capped at 20 free requests/project/day — and a
// tool-firing chat costs two calls, so that runs out after ~10 hotel questions.
// Override with GEMINI_MODEL once you're off the free tier.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 15000;

/**
 * Output ceiling, not a target — a short answer costs the same at 2048 as at
 * 800, so one generous value serves both reply shapes rather than branching.
 * 800 was too tight: tool-call replies format up to 10 hotels with names,
 * prices and room types, and were being cut off mid-entry.
 */
const MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 2048;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Error type the route can translate into a clear HTTP status.
 * `status` is the status to send the client; `clientMessage` is safe to expose.
 */
export class GeminiError extends Error {
  constructor(message, { status = 502, clientMessage } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.clientMessage = clientMessage || 'The AI service is currently unavailable. Please try again.';
  }
}

const MAX_TOOL_ROUNDS = 2;

async function callGemini({ contents, systemInstruction, tools }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: controller.signal,
        httpOptions: { timeout: TIMEOUT_MS },
        ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
      },
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new GeminiError(`Gemini request timed out after ${TIMEOUT_MS}ms`, {
        status: 504,
        clientMessage: 'The AI service took too long to respond. Please try again.',
      });
    }
    // Quota exhaustion is common on the free tier and needs its own message —
    // "service unavailable" sends you debugging the wrong thing entirely.
    if (err.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(err.message ?? '')) {
      const retry = err.message?.match(/retry in ([\d.]+)s/i)?.[1];
      throw new GeminiError(`Gemini quota exceeded: ${err.message}`, {
        status: 429,
        clientMessage: `AI request quota exceeded${retry ? ` — retry in about ${Math.ceil(Number(retry))}s` : ''}. The Gemini free tier is limited per model per day.`,
      });
    }
    throw new GeminiError(`Gemini request failed: ${err.message}`, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a grounded prompt to Gemini and return the reply text.
 * Throws GeminiError on timeout, upstream failure, or an empty/blocked
 * response — the caller must never surface a silent empty answer.
 *
 * When `tools` (Gemini function declarations) and `executeTool` are supplied,
 * function calls are executed and fed back for up to MAX_TOOL_ROUNDS rounds.
 * Omitting them reproduces the original single-round behaviour exactly.
 *
 * Returns { text, toolCalls } — toolCalls records what was actually invoked,
 * so the route can report it without re-deriving it.
 */
export async function generateChatReply({ systemInstruction, userPrompt, tools, executeTool }) {
  const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];
  const toolCalls = [];

  for (let round = 0; ; round += 1) {
    // Stop offering tools once the budget is spent, so the last round is
    // forced to produce prose rather than another function call.
    const offerTools = executeTool && round < MAX_TOOL_ROUNDS ? tools : undefined;
    const response = await callGemini({ contents, systemInstruction, tools: offerTools });

    const calls = response?.functionCalls ?? [];
    if (offerTools && calls.length > 0) {
      const modelTurn = response?.candidates?.[0]?.content;
      if (modelTurn) contents.push(modelTurn);

      const parts = [];
      for (const call of calls) {
        let payload;
        try {
          payload = await executeTool(call.name, call.args ?? {});
        } catch (err) {
          // Hand the failure to the model as data so it can explain itself,
          // rather than throwing and losing the turn entirely.
          payload = { error: err.message };
        }
        toolCalls.push({ name: call.name, args: call.args ?? {}, result: payload });
        parts.push({ functionResponse: { name: call.name, response: payload } });
      }
      contents.push({ role: 'user', parts });
      continue;
    }

    const text = response?.text?.trim();
    if (!text) {
      // No candidates, or blocked by a safety filter — surface it, don't 200 with "".
      const reason = response?.promptFeedback?.blockReason;
      throw new GeminiError(`Gemini returned no text${reason ? ` (blockReason: ${reason})` : ''}`, {
        status: 502,
        clientMessage: 'The AI service could not generate a response for that message.',
      });
    }

    // Truncation is otherwise silent — the reply just stops mid-sentence and
    // still looks like a valid 200. Surface it so the cap can be tuned.
    if (response?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      console.warn(
        `Gemini reply hit MAX_TOKENS (${MAX_OUTPUT_TOKENS}) and was truncated — raise GEMINI_MAX_OUTPUT_TOKENS.`
      );
    }

    return { text, toolCalls };
  }
}
