/**
 * DevTools — Developer Toolkit MCP server for the Construct platform.
 *
 * Tools:
 *   json_format  — Format, minify, or validate JSON
 *   base64       — Encode/decode Base64
 *   hash         — SHA-256 hash of text
 *   uuid         — Generate v4 UUIDs
 *   timestamp    — Unix ↔ ISO date conversion
 *   url_encode   — URL encode/decode
 */

import * as readline from 'node:readline';

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'json_format',
    description: 'Format, minify, or validate a JSON string.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        json: { type: 'string', description: 'The JSON string to process' },
        mode: { type: 'string', enum: ['format', 'minify', 'validate'], description: 'Operation mode (default: format)' },
        indent: { type: 'number', description: 'Indent spaces for format mode (default: 2)' },
      },
      required: ['json'],
    },
  },
  {
    name: 'base64',
    description: 'Encode or decode a Base64 string.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text to encode or decode' },
        mode: { type: 'string', enum: ['encode', 'decode'], description: 'Operation mode (default: encode)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'hash',
    description: 'Generate a SHA-256 hash of the given text.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text to hash' },
        algorithm: { type: 'string', enum: ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'], description: 'Hash algorithm (default: SHA-256)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'uuid',
    description: 'Generate one or more v4 UUIDs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        count: { type: 'number', description: 'Number of UUIDs to generate (default: 1, max: 50)' },
      },
    },
  },
  {
    name: 'timestamp',
    description: 'Convert between Unix timestamps and ISO 8601 dates. Accepts either a Unix timestamp (seconds or ms) or an ISO date string.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        value: { type: 'string', description: 'A Unix timestamp (seconds or ms) or an ISO date string. Omit for current time.' },
      },
    },
  },
  {
    name: 'url_encode',
    description: 'URL-encode or decode a string.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The string to encode or decode' },
        mode: { type: 'string', enum: ['encode', 'decode'], description: 'Operation mode (default: encode)' },
      },
      required: ['text'],
    },
  },
];

// ─── Tool handlers ───────────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'json_format': {
        const input = args.json as string;
        const mode = (args.mode as string) || 'format';
        const indent = (args.indent as number) || 2;

        // Parse first to validate
        const parsed = JSON.parse(input);

        if (mode === 'validate') {
          const type = Array.isArray(parsed) ? 'array' : typeof parsed;
          const keys = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? Object.keys(parsed).length : 0;
          const items = Array.isArray(parsed) ? parsed.length : 0;
          let info = `✓ Valid JSON (${type})`;
          if (keys > 0) info += ` — ${keys} key${keys > 1 ? 's' : ''}`;
          if (items > 0) info += ` — ${items} item${items > 1 ? 's' : ''}`;
          info += `\nSize: ${input.length} chars → ${JSON.stringify(parsed).length} chars minified`;
          return { content: [{ type: 'text', text: info }] };
        }

        const output = mode === 'minify'
          ? JSON.stringify(parsed)
          : JSON.stringify(parsed, null, indent);
        return { content: [{ type: 'text', text: output }] };
      }

      case 'base64': {
        const text = args.text as string;
        const mode = (args.mode as string) || 'encode';

        if (mode === 'decode') {
          const decoded = new TextDecoder().decode(
            Uint8Array.from(atob(text), c => c.charCodeAt(0))
          );
          return { content: [{ type: 'text', text: decoded }] };
        }
        const encoded = btoa(
          String.fromCharCode(...new TextEncoder().encode(text))
        );
        return { content: [{ type: 'text', text: encoded }] };
      }

      case 'hash': {
        const text = args.text as string;
        const algorithm = (args.algorithm as string) || 'SHA-256';
        const data = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest(algorithm, data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return { content: [{ type: 'text', text: `${algorithm}: ${hex}` }] };
      }

      case 'uuid': {
        const count = Math.min(Math.max(1, (args.count as number) || 1), 50);
        const uuids = Array.from({ length: count }, () => crypto.randomUUID());
        return { content: [{ type: 'text', text: uuids.join('\n') }] };
      }

      case 'timestamp': {
        const value = args.value as string | undefined;
        let date: Date;

        if (!value || value.trim() === '') {
          date = new Date();
        } else {
          const num = Number(value);
          if (!isNaN(num)) {
            // Unix timestamp — detect seconds vs milliseconds
            date = new Date(num > 1e12 ? num : num * 1000);
          } else {
            date = new Date(value);
            if (isNaN(date.getTime())) {
              return { content: [{ type: 'text', text: `Cannot parse: "${value}". Provide a Unix timestamp or ISO date.` }], isError: true };
            }
          }
        }

        const unixSec = Math.floor(date.getTime() / 1000);
        const unixMs = date.getTime();
        const iso = date.toISOString();
        const local = date.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' });
        const relative = getRelativeTime(date);

        return {
          content: [{
            type: 'text',
            text: [
              `ISO 8601:    ${iso}`,
              `Unix (sec):  ${unixSec}`,
              `Unix (ms):   ${unixMs}`,
              `UTC:         ${local}`,
              `Relative:    ${relative}`,
            ].join('\n'),
          }],
        };
      }

      case 'url_encode': {
        const text = args.text as string;
        const mode = (args.mode as string) || 'encode';
        const output = mode === 'decode' ? decodeURIComponent(text) : encodeURIComponent(text);
        return { content: [{ type: 'text', text: output }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}

function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'ago' : 'from now';

  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)} minutes ${suffix}`;
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)} hours ${suffix}`;
  if (abs < 2_592_000_000) return `${Math.floor(abs / 86_400_000)} days ${suffix}`;
  if (abs < 31_536_000_000) return `${Math.floor(abs / 2_592_000_000)} months ${suffix}`;
  return `${Math.floor(abs / 31_536_000_000)} years ${suffix}`;
}

// ─── JSON-RPC handler ────────────────────────────────────────────────────────

async function handleRequest(req: { id?: number; method: string; params?: Record<string, unknown> }): Promise<object | null> {
  const { id, method, params } = req;

  if (id == null) return null;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'devtools', version: '1.0.0' },
        },
      };

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

    case 'tools/call': {
      const toolName = (params as { name: string }).name;
      const toolArgs = (params as { arguments?: Record<string, unknown> }).arguments || {};
      const result = await handleToolCall(toolName, toolArgs);
      return { jsonrpc: '2.0', id, result };
    }

    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line: string) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const response = await handleRequest(req);
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    }) + '\n');
  }
});
