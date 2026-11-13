'use strict';
const assert = require('node:assert/strict');
const { createServer } = require('../server');

async function main() {
  const token = 'test-token-' + 'a'.repeat(40);
  let revision = 0, snapshot = null;
  const operations = new Map();
  const store = {
    async status() { return { ok: true, driver: 'mysql', version: revision, initialized: !!snapshot, updatedAt: 0 }; },
    async pull() { return { ok: true, driver: 'mysql', version: revision, state: snapshot, updatedAt: 0 }; },
    async push(input) {
      if (operations.has(input.operationId)) return { ok: true, driver: 'mysql', version: operations.get(input.operationId), idempotent: true };
      if (Number(input.expectedVersion) !== revision) return { statusCode: 409, body: { ok: false, conflict: true, version: revision, state: snapshot } };
      revision++; snapshot = input.state; operations.set(input.operationId, revision);
      return { ok: true, driver: 'mysql', version: revision };
    }
  };
  const server = createServer({ env: { SYNC_API_TOKEN: token, SYNC_DB_DRIVER: 'mysql' }, syncStore: store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, options = {}) => {
    const response = await fetch(base + url, options);
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  };
  try {
    let response = await call('/api/health');
    assert.equal(response.status, 200); assert.equal(response.body.syncConfigured, true);
    response = await call('/api/sync', { method: 'OPTIONS' });
    assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), '*');
    response = await call('/api/sync?op=status');
    assert.equal(response.status, 401);
    response = await call('/api/print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401);
    response = await call('/api/sync?op=status', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); assert.equal(response.body.version, 0);
    response = await call('/api/sync?op=pull', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200); assert.equal(response.body.state, null);
    const state = { meta: { version: 2 }, users: [], products: [{ id: 'p1' }] };
    const operationId = 'test-op-00000001';
    const push = { expectedVersion: 0, operationId, state };
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    response = await call('/api/sync?op=push', { method: 'POST', headers, body: JSON.stringify(push) });
    assert.equal(response.status, 200); assert.equal(response.body.version, 1);
    response = await call('/api/sync?op=push', { method: 'POST', headers, body: JSON.stringify(push) });
    assert.equal(response.status, 200); assert.equal(response.body.idempotent, true);
    response = await call('/api/sync?op=push', { method: 'POST', headers, body: JSON.stringify({ ...push, operationId: 'test-op-00000002' }) });
    assert.equal(response.status, 409); assert.equal(response.body.conflict, true); assert.equal(response.body.state.products[0].id, 'p1');
    response = await call('/api/sync?op=unknown', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 404);
    console.log('Node sync API tests: 9 passed, 0 failed');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
