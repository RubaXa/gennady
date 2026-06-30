// @file: ai/inspector — zero-dep static server for web/ (so the UI can fetch trace.json over http).
// Run: npx tsx ai/inspector/serve.ts   (PORT env optional, default 4173)
// "Open in editor" is handled client-side via the editor URL scheme (vscode://file/...), no server spawn.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'web');
const PORT = Number(process.env.PORT) || 4173;
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0] as string);
  if (p === '/') p = '/index.html';
  const f = join(dir, p);
  if (!f.startsWith(dir) || !existsSync(f) || !statSync(f).isFile()) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('content-type', MIME[extname(f)] ?? 'text/plain');
  res.end(readFileSync(f));
}).listen(PORT, () => console.log(`[inspector] http://localhost:${PORT}`));
