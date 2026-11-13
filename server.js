/** Hooshyar POS Node.js host: static UI, shared offline-sync API, and print proxy. */
'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSyncStore } = require('./backend/node/sync-store');

const ROOT = path.join(__dirname, 'webapp');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, type = 'application/json; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, Object.assign({
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  }, extraHeaders));
  res.end(body);
}
const json = (res, status, obj, headers) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', headers);

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '', settled = false;
    req.on('data', chunk => {
      if (settled) return;
      raw += chunk.toString('utf8');
      if (Buffer.byteLength(raw, 'utf8') > limit) {
        settled = true;
        const error = new Error('بدنهٔ درخواست بیش از حد مجاز است.');
        error.statusCode = 413;
        reject(error);
        req.resume();
      }
    });
    req.on('end', () => {
      if (settled) return;
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (_) { const e = new Error('JSON درخواست نامعتبر است.'); e.statusCode = 400; reject(e); }
    });
    req.on('error', error => { if (!settled) { settled = true; reject(error); } });
  });
}

function rawPrint(ip, port, base64) {
  return new Promise((resolve, reject) => {
    if (!/^[\w.\-:]+$/.test(String(ip || ''))) return reject(new Error('آدرس IP نامعتبر است'));
    const p = Number(port || 9100);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return reject(new Error('پورت نامعتبر است'));
    let payload;
    try { payload = Buffer.from(String(base64), 'base64'); } catch (_) { return reject(new Error('دادهٔ چاپ نامعتبر است')); }
    if (!payload.length) return reject(new Error('دادهٔ چاپ خالی است'));
    const socket = new net.Socket();
    let done = false;
    const finish = error => {
      if (done) return;
      done = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };
    socket.setTimeout(6000);
    socket.on('connect', () => socket.write(payload, () => setTimeout(finish, 120)));
    socket.on('timeout', () => finish(new Error('زمان اتصال به چاپگر به پایان رسید')));
    socket.on('error', finish);
    socket.connect(p, String(ip));
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function tokenMatches(expected, provided) {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(provided || ''), 'utf8');
  return a.length >= 32 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createServer(options = {}) {
  const env = options.env || process.env;
  let syncStore = options.syncStore || null;
  const getSyncStore = () => {
    if (!syncStore) syncStore = createSyncStore(env);
    return syncStore;
  };

  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
    catch (_) { return json(res, 400, { ok: false, error: 'نشانی درخواست نامعتبر است.' }); }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch (_) { return json(res, 400, { ok: false, error: 'مسیر درخواست نامعتبر است.' }); }

    if (pathname === '/api/health') {
      return json(res, 200, {
        ok: true, app: 'Hooshyar POS Node.js', time: Date.now(),
        syncConfigured: String(env.SYNC_API_TOKEN || '').length >= 32,
        databaseDriver: String(env.SYNC_DB_DRIVER || 'mysql').toLowerCase()
      });
    }

    if (pathname === '/api/sync') {
      const headers = corsHeaders();
      if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
      const expectedToken = String(env.SYNC_API_TOKEN || '');
      if (expectedToken.length < 32) return json(res, 503, { ok: false, error: 'توکن همگام‌سازی در متغیر SYNC_API_TOKEN تنظیم نشده است.' }, headers);
      if (!tokenMatches(expectedToken, req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''))) {
        return json(res, 401, { ok: false, error: 'توکن API نامعتبر است.' }, headers);
      }
      const operation = String(url.searchParams.get('op') || '');
      const expectedMethod = operation === 'status' ? 'GET' : (operation === 'pull' || operation === 'push' ? 'POST' : '');
      if (!expectedMethod) return json(res, 404, { ok: false, error: 'عملیات API شناخته نشد.' }, headers);
      if (req.method !== expectedMethod) return json(res, 405, { ok: false, error: 'متد درخواست برای این عملیات مجاز نیست.' }, headers);
      try {
        const store = getSyncStore();
        let result;
        if (operation === 'status') result = await store.status();
        else if (operation === 'pull') { await readBody(req, 1024 * 1024); result = await store.pull(); }
        else {
          const input = await readBody(req, 32 * 1024 * 1024);
          result = await store.push(input);
        }
        const status = result.statusCode || 200;
        if (result.body) result = result.body;
        return json(res, status, result, headers);
      } catch (error) {
        const status = Number(error.statusCode) || (error.code === 'ER_ACCESS_DENIED_ERROR' ? 503 : 500);
        console.error('Hooshyar sync API:', error.message);
        return json(res, status, {
          ok: false,
          error: status === 400 || status === 413 ? error.message : 'خطای اتصال دیتابیس/API؛ گزارش جزئیات در لاگ Node.js ثبت شد.'
        }, headers);
      }
    }

    if (pathname === '/api/print') {
      const expectedToken = String(env.SYNC_API_TOKEN || '');
      if (expectedToken.length < 32) return json(res, 503, { ok: false, error: 'توکن سرور تنظیم نشده است.' });
      if (!tokenMatches(expectedToken, req.headers.authorization && req.headers.authorization.replace(/^Bearer\\s+/i, ''))) {
        return json(res, 401, { ok: false, error: 'توکن API نامعتبر است.' });
      }
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'فقط POST مجاز است' });
      try {
        const body = await readBody(req);
        await rawPrint(body.ip, body.port, body.data);
        return json(res, 200, { ok: true, bytes: Buffer.from(String(body.data), 'base64').length });
      } catch (error) {
        return json(res, Number(error.statusCode) || 502, { ok: false, error: error.message });
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, error: 'متد پشتیبانی نمی‌شود' });
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT + path.sep) && full !== path.join(ROOT, 'index.html')) {
      return json(res, 403, { ok: false, error: 'دسترسی مجاز نیست' });
    }
    fs.stat(full, (error, stat) => {
      if (error || !stat.isFile()) return json(res, 404, { ok: false, error: 'یافت نشد' });
      const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type, 'Content-Length': stat.size,
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(full).pipe(res);
    });
  });
}

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => console.log(`Hooshyar POS Node.js listening on ${host}:${port}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createServer, readBody, tokenMatches };
