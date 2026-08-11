/**
 * MCP client for the mcp-hotels server.
 *
 * Lifecycle: lazy long-lived singleton. The child process is spawned on first
 * tool use (not at boot, so a broken MCP server can't stop Express starting),
 * then reused for the life of the process. Spawning per request would cost
 * 100-300ms of Node startup on every chat message for a connection that holds
 * no per-user state.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, '../../../mcp-hotels/src/index.js');

const CALL_TIMEOUT_MS = 25000;

// Cache the in-flight promise, not just the resolved client, so concurrent
// requests during startup don't each spawn a child process.
let clientPromise = null;

async function connect() {
  const transport = new StdioClientTransport({
    command: process.execPath, // same node binary that's running Express
    args: [SERVER_ENTRY],
    // The key crosses here, into the child's environment only. It is never
    // part of any HTTP response, so it cannot reach the browser client.
    env: { ...process.env, LITEAPI_KEY: process.env.LITEAPI_KEY },
    stderr: 'inherit',
  });

  const client = new Client({ name: 'ai-trip-planner', version: '1.0.0' });
  await client.connect(transport);

  // If the child dies, drop the cache so the next call reconnects rather than
  // throwing forever against a dead transport.
  transport.onclose = () => {
    clientPromise = null;
  };

  return client;
}

export function getClient() {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null; // failed connect must not be cached
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Fetch the MCP tool list and translate it into Gemini function declarations.
 * The description and schema are single-sourced from the MCP server — nothing
 * about the tool is duplicated here.
 */
export async function listTools() {
  const client = await getClient();
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.inputSchema,
  }));
}

/** Call an MCP tool and return its parsed JSON payload. */
export async function callTool(name, args) {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args }, undefined, {
    timeout: CALL_TIMEOUT_MS,
  });

  const text = result.content?.find((c) => c.type === 'text')?.text ?? '';

  if (result.isError) {
    throw new Error(text || `MCP tool ${name} failed`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function closeClient() {
  if (!clientPromise) return;
  const pending = clientPromise;
  clientPromise = null;
  try {
    const client = await pending;
    await client.close();
  } catch {
    // already gone
  }
}
