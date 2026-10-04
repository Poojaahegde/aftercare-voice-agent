import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';
import { classifyLocally, isSensitive, ORDERS } from './agent.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };
const ALLOWED = new Set(['/','/index.html','/styles.css','/app.mjs','/agent.mjs','/evals.mjs']);
const INTENT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { issue: { type: 'string', enum: ['delivery','damage','return','unknown'] },
    orderId: { type: 'string', enum: ['','AC-1042','AC-2087','AC-3150'] } },
  required: ['issue','orderId']
};

function localResult(text, mode = 'local') { return { ...classifyLocally(text), mode }; }

export async function interpret(utterance, phase = 'issue', options = {}) {
  const text = String(utterance ?? '').trim().slice(0, 400);
  if (!text || isSensitive(text)) return { issue: 'unknown', orderId: '', mode: 'blocked' };
  if (!options.apiKey) return localResult(text);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(9000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({ model: options.model || MODEL,
        instructions: 'Classify the issue and known synthetic order ID for a demo ecommerce support voice agent. Return only the schema. Do not invent orders or policy decisions. A separate deterministic policy handles all actions. Use unknown and empty orderId if unsure. Never extract private contact or payment information.',
        input: JSON.stringify({ utterance: text, phase, sampleOrders: ORDERS.map(({ id, item, status }) => ({ id, item, status })) }),
        text: { format: { type: 'json_schema', name: 'aftercare_intent', strict: true, schema: INTENT_SCHEMA } }
      })
    });
    if (!response.ok) return localResult(text, 'fallback');
    const data = await response.json();
    const output = data.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text;
    if (!output) return localResult(text, 'fallback');
    const parsed = JSON.parse(output);
    if (!['delivery','damage','return','unknown'].includes(parsed.issue) || !['','AC-1042','AC-2087','AC-3150'].includes(parsed.orderId)) return localResult(text, 'fallback');
    return { issue: parsed.issue, orderId: parsed.orderId, mode: 'model' };
  } catch { return localResult(text, 'fallback'); }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new Error('Payload too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

export function createServer(options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  return createHttpServer(async (req, res) => {
    const path = normalize(new URL(req.url, 'http://localhost').pathname);
    if (req.method === 'GET' && path === '/api/config') return sendJson(res, 200, { aiAvailable: Boolean(apiKey), model: apiKey ? (options.model || MODEL) : null });
    if (req.method === 'POST' && path === '/api/interpret') {
      try {
        const body = await readJson(req);
        if (typeof body.utterance !== 'string') return sendJson(res, 400, { error: 'utterance must be text' });
        return sendJson(res, 200, await interpret(body.utterance, body.phase, { apiKey, model: options.model }));
      } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    }
    if (req.method !== 'GET' || !ALLOWED.has(path)) return sendJson(res, 404, { error: 'Not found' });
    try {
      const target = join(ROOT, path === '/' ? 'index.html' : path.slice(1));
      const content = await readFile(target);
      res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'text/plain', 'X-Content-Type-Options': 'nosniff' });
      res.end(content);
    } catch { sendJson(res, 404, { error: 'Not found' }); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, () => process.stdout.write(`Aftercare Voice Agent running at http://localhost:${port}\n`));
}
