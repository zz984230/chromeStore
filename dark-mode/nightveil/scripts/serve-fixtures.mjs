// scripts/serve-fixtures.mjs
// Zero-dependency static server for acceptance fixtures (port 8123).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('tests/fixtures');
const PORT = 8123;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, () => console.log(`[nightveil] fixtures on http://localhost:${PORT}`));
