// Local dev server: serves index.html and routes /api/* to the same handlers
// Vercel runs. Loads .env if present. Usage: npm run dev
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(root, '.env'))) {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function wrap(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return res;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    wrap(res);
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
      const file = path.join(root, 'api', name + '.js');
      if (!existsSync(file)) return res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } });
      let raw = '';
      for await (const c of req) { raw += c; if (raw.length > 1_000_000) return res.status(413).json({ error: { code: 'too_large', message: 'Request too large.' } }); }
      try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
      const mod = await import(pathToFileURL(file).href);
      return mod.default(req, res);
    }
    const p = url.pathname === '/' ? '/index.html' : url.pathname;
    const f = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(root) || !existsSync(f) || /[/\\](api|lib|scripts|tests|\.git)[/\\]/.test(f.slice(root.length))) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
    res.end(await readFile(f));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(PORT, () => console.log(`OPPAPP on http://localhost:${PORT}  (Gemini ${process.env.GEMINI_API_KEY ? 'configured' : 'NOT configured — AI features will show as offline'})`));
}
