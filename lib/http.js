// Shared request handling for the API routes: method check, CORS for the
// GitHub Pages origin, size limits, a best-effort per-IP rate limit, and
// consistent error responses. Request bodies are never logged.
import { AIError } from './gemini.js';

const buckets = new Map(); // in-memory, per serverless instance (best effort only)
const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 20);

function allowOrigin(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function rateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, t: now };
  if (now - b.t > 60000) { b.n = 0; b.t = now; }
  b.n++; buckets.set(ip, b);
  return b.n > LIMIT;
}

export const clip = (s, n) => String(s ?? '').slice(0, n);

export function route(handler, { methods = ['POST'] } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    allowOrigin(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!methods.includes(req.method)) return res.status(405).json({ error: { code: 'method', message: 'Method not allowed.' } });
    if (req.method === 'POST') {
      if (rateLimited(req)) return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' } });
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || typeof body !== 'object') return res.status(400).json({ error: { code: 'bad_json', message: 'Request body must be JSON.' } });
      req.body = body;
    }
    try {
      const out = await handler(req);
      return res.status(200).json(out);
    } catch (e) {
      if (e instanceof AIError) return res.status(e.status).json({ error: { code: e.code, message: e.message } });
      if (e?.status === 400) return res.status(400).json({ error: { code: 'invalid', message: e.message } });
      console.error('api_error', e?.name, e?.code); // no payloads in logs
      return res.status(500).json({ error: { code: 'server', message: 'Something went wrong on our side.' } });
    }
  };
}

export function bad(message) { const e = new Error(message); e.status = 400; return e; }
