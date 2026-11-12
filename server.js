/**
 * Hooshyar POS — lightweight preview server.
 *
 * It serves webapp/ as a static site and exposes one small hardware proxy:
 * POST /api/print  { ip, port, data(base64) } -> raw TCP ESC/POS (port 9100).
 * On Android the same bytes are delivered natively by AndroidPOS.print(),
 * so this proxy is only needed when the web UI is opened in a desktop browser
 * on the same LAN as a network thermal printer.
 */
'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'webapp');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 8 * 1024 * 1024) reject(new Error('بدنه درخواست بیش از حد بزرگ است'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON نامعتبر')); }
    });
    req.on('error', reject);
  });
}

function rawPrint(ip, port, base64) {
  return new Promise((resolve, reject) => {
    if (!/^[\w.\-:]+$/.test(String(ip || ''))) return reject(new Error('آدرس IP نامعتبر است'));
    const p = Number(port || 9100);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return reject(new Error('پورت نامعتبر است'));
    let payload;
    try { payload = Buffer.from(String(base64), 'base64'); } catch (e) { return reject(new Error('داده چاپ نامعتبر است')); }
    if (!payload.length) return reject(new Error('داده چاپ خالی است'));

    const socket = new net.Socket();
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(6000);
    socket.on('connect', () => socket.write(payload, () => setTimeout(finish, 120)));
    socket.on('timeout', () => finish(new Error('زمان اتصال به چاپگر به پایان رسید')));
    socket.on('error', e => finish(e));
    socket.connect(p, String(ip));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/health') return json(res, 200, { ok: true, app: 'Hooshyar POS', time: Date.now() });

  if (pathname === '/api/print') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'فقط POST مجاز است' });
    try {
      const body = await readBody(req);
      await rawPrint(body.ip, body.port, body.data);
      return json(res, 200, { ok: true, bytes: Buffer.from(String(body.data), 'base64').length });
    } catch (e) {
      return json(res, 502, { ok: false, error: e.message });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, error: 'متد پشتیبانی نمیشود' });

  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep) && full !== path.join(ROOT, 'index.html')) {
    return json(res, 403, { ok: false, error: 'دسترسی مجاز نیست' });
  }
  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA-ish fallback so a refresh on any path still opens the app
      const fallback = path.join(ROOT, 'index.html');
      return fs.readFile(fallback, (e2, buf) => e2 ? json(res, 404, { ok: false, error: 'یافت نشد' }) : send(res, 200, req.method === 'HEAD' ? '' : buf, MIME['.html']));
    }
    const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Hooshyar POS preview → http://${HOST}:${PORT}`);
});
