'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const { validatePush } = require('../backend/node/sync-store');

assert.equal(fs.existsSync(path.join(root, 'webapp')), false, 'shared client assets should be removed');
assert.equal(fs.existsSync(path.join(root, 'WEB-GUIDE.md')), false, 'web deployment guide should be removed');
assert.equal(fs.existsSync(path.join(root, 'release', 'hooshyar-node-host.zip')), false, 'web host bundle should be removed');
assert.equal(pkg.scripts.start, 'node server.js');
assert.equal(pkg.dependencies.mysql2 != null, true);
assert.equal(pkg.dependencies.mssql != null, true);
assert.equal(pkg.scripts.desktop, undefined, 'desktop UI build must not be advertised without shared UI');
assert.equal(server.includes("pathname === '/api/sync'"), true);
assert.equal(server.includes("pathname === '/api/print'"), true);
assert.equal(server.includes('رابط وب میزبانی نمی‌شود'), true);
assert.equal(server.includes('createReadStream'), false, 'API server must not serve static client assets');

const valid = validatePush({
  expectedVersion: 0,
  operationId: 'check-op-00000001',
  state: { meta: { version: 2 }, users: [], products: [] }
});
assert.equal(valid.expected, 0);
assert.equal(valid.operationId, 'check-op-00000001');
assert.throws(() => validatePush({ expectedVersion: -1, operationId: 'bad', state: {} }));
console.log('API-only project checks: 14 assertions passed');
