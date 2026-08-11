import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

// Fail loudly at import time if the key is missing — same contract as db/pool.js,
// so the server won't boot half-configured.
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set — copy server/.env.example to server/.env');
}

// Floating alias that tracks Google's current flash model — avoids pinning to a
// version that later gets retired for new keys (as gemini-2.5-flash was).
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 15000;

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

/**
 * Send a grounded prompt to Gemini and return the reply text.
 * Throws GeminiError on timeout, upstream failure, or an empty/blocked
 * response — the caller must never surface a silent empty answer.
 */
export async function generateChatReply({ systemInstruction, userPrompt }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 800,
        abortSignal: controller.signal,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new GeminiError(`Gemini request timed out after ${TIMEOUT_MS}ms`, {
        status: 504,
        clientMessage: 'The AI service took too long to respond. Please try again.',
      });
    }
    throw new GeminiError(`Gemini request failed: ${err.message}`, { status: 502 });
  } finally {
    clearTimeout(timer);
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

  return text;
}
