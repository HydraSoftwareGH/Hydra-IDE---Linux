// =============================================================================
// serve-web.js — Servidor local de preview de la web oficial (landing + /ide).
//
// Sirve website/public replicando el comportamiento de Vercel:
//   • /ide  y  /ide/   ->  /ide/index.html   (rewrite, igual que vercel.json)
//   • directorios       ->  index.html
//   • archivos estáticos tal cual
//
// Así probás el IDE en el navegador en http://127.0.0.1:8080/ide sin depender
// de la configuración de Live Server. Uso:  npm run serve:web
// =============================================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'website', 'public');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.map': 'application/json',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // Rewrite de /ide -> /ide/index.html (igual que Vercel/Firebase).
  if (urlPath === '/ide' || urlPath === '/ide/') urlPath = '/ide/index.html';

  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');

  // Directorio -> su index.html.
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (e) {}

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback SPA de la landing (como el rewrite ** -> /index.html).
      if (!urlPath.startsWith('/ide')) {
        return fs.readFile(path.join(ROOT, 'index.html'), (e2, d2) => {
          if (e2) return send(res, 404, 'Not found');
          send(res, 200, d2, MIME['.html']);
        });
      }
      return send(res, 404, 'Not found: ' + urlPath);
    }
    send(res, 200, data, MIME[path.extname(filePath)] || 'application/octet-stream');
  });
});

server.listen(PORT, () => {
  console.log('[serve:web] Web oficial en  http://127.0.0.1:' + PORT + '/');
  console.log('[serve:web] Hydra IDE web en http://127.0.0.1:' + PORT + '/ide');
});
