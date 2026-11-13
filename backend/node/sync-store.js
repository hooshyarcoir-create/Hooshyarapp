'use strict';

const OP_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

function parseStatePayload(payload) {
  if (payload == null || payload === '') return null;
  try {
    const state = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('not an object');
    return state;
  } catch (_) {
    throw new Error('ذخیرهٔ snapshot سرور معتبر نیست؛ مدیر باید نسخهٔ پشتیبان را بررسی کند.');
  }
}

function validatePush(input) {
  const state = input && input.state;
  const expected = Number(input && input.expectedVersion);
  const operationId = String(input && input.operationId || '');
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      !state.meta || typeof state.meta !== 'object' || !Array.isArray(state.users) ||
      !Number.isSafeInteger(expected) || expected < 0 || !OP_ID_PATTERN.test(operationId)) {
    const error = new Error('دادهٔ POS، شناسهٔ عملیات یا نسخهٔ پایه معتبر نیست.');
    error.statusCode = 400;
    throw error;
  }
  const payload = JSON.stringify(state);
  if (Buffer.byteLength(payload, 'utf8') > 32 * 1024 * 1024) {
    const error = new Error('حجم snapshot از 32 مگابایت بیشتر است.');
    error.statusCode = 413;
    throw error;
  }
  return { state, payload, expected, operationId };
}

function createSyncStore(env = process.env) {
  const driver = String(env.SYNC_DB_DRIVER || 'mysql').toLowerCase();
  const host = env.SYNC_DB_HOST || '';
  const database = env.SYNC_DB_NAME || '';
  const username = env.SYNC_DB_USER || '';
  const password = env.SYNC_DB_PASSWORD || '';
  const port = Number(env.SYNC_DB_PORT || (driver === 'sqlsrv' ? 1433 : 3306));
  let pool = null;
  let sql = null;
  let initializing = null;

  if (!['mysql', 'sqlsrv'].includes(driver)) {
    const error = new Error('SYNC_DB_DRIVER must be mysql or sqlsrv.'); error.statusCode = 503; throw error;
  }
  if (!host || !database || !username) {
    const error = new Error('SYNC_DB_HOST, SYNC_DB_NAME and SYNC_DB_USER are required.'); error.statusCode = 503; throw error;
  }

  async function initialize() {
    if (driver === 'mysql') {
      const mysql = require('mysql2/promise');
      pool = mysql.createPool({
        host, port, database, user: username, password,
        waitForConnections: true, connectionLimit: Number(env.SYNC_DB_POOL_SIZE || 10),
        queueLimit: 0, charset: 'utf8mb4', connectTimeout: 10000
      });
      await pool.execute('SELECT 1');
      await pool.execute('CREATE TABLE IF NOT EXISTS hooshyar_sync_state (id TINYINT NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, payload LONGTEXT NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
      await pool.execute('INSERT IGNORE INTO hooshyar_sync_state (id,revision,payload,updated_at) VALUES (1,0,NULL,0)');
      await pool.execute('CREATE TABLE IF NOT EXISTS hooshyar_sync_ops (operation_id VARCHAR(100) NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
      return;
    }

    sql = require('mssql');
    pool = new sql.ConnectionPool({
      server: host, port, database, user: username, password,
      connectionTimeout: 15000, requestTimeout: 30000,
      pool: { max: Number(env.SYNC_DB_POOL_SIZE || 10), min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt: env.SYNC_DB_ENCRYPT !== 'false',
        trustServerCertificate: env.SYNC_DB_TRUST_SERVER_CERTIFICATE === 'true',
        enableArithAbort: true
      }
    });
    await pool.connect();
    await pool.request().query("IF OBJECT_ID(N'dbo.hooshyar_sync_state', N'U') IS NULL CREATE TABLE dbo.hooshyar_sync_state (id TINYINT NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, payload NVARCHAR(MAX) NULL, updated_at BIGINT NOT NULL)");
    await pool.request().query("IF NOT EXISTS (SELECT 1 FROM dbo.hooshyar_sync_state WHERE id=1) INSERT INTO dbo.hooshyar_sync_state (id,revision,payload,updated_at) VALUES (1,0,NULL,0)");
    await pool.request().query("IF OBJECT_ID(N'dbo.hooshyar_sync_ops', N'U') IS NULL CREATE TABLE dbo.hooshyar_sync_ops (operation_id VARCHAR(100) NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, created_at BIGINT NOT NULL)");
  }

  async function ready() {
    if (!initializing) initializing = initialize().catch(error => { initializing = null; throw error; });
    return initializing;
  }

  async function currentState() {
    await ready();
    const query = driver === 'mysql'
      ? 'SELECT revision,payload,updated_at FROM hooshyar_sync_state WHERE id=1'
      : 'SELECT revision,payload,updated_at FROM dbo.hooshyar_sync_state WHERE id=1';
    const result = driver === 'mysql' ? (await pool.query(query))[0][0] : (await pool.request().query(query)).recordset[0];
    if (!result) throw new Error('ردیف همگام‌سازی در دیتابیس ایجاد نشده است.');
    return {
      ok: true, driver, version: Number(result.revision),
      state: parseStatePayload(result.payload), updatedAt: Number(result.updated_at) || 0,
      initialized: result.payload != null
    };
  }

  async function pushMysql(data) {
    const connection = await pool.getConnection();
    let transaction = false;
    try {
      await connection.beginTransaction(); transaction = true;
      const [rows] = await connection.query('SELECT revision,payload,updated_at FROM hooshyar_sync_state WHERE id=1 FOR UPDATE');
      const row = rows[0];
      if (!row) throw new Error('ردیف همگام‌سازی پیدا نشد.');
      const [ops] = await connection.execute('SELECT revision FROM hooshyar_sync_ops WHERE operation_id=?', [data.operationId]);
      if (ops.length) {
        await connection.commit(); transaction = false;
        return { ok: true, driver, version: Number(ops[0].revision), idempotent: true };
      }
      const revision = Number(row.revision);
      if (revision !== data.expected) {
        await connection.rollback(); transaction = false;
        return { statusCode: 409, body: { ok: false, conflict: true, version: revision, state: parseStatePayload(row.payload), error: 'نسخهٔ سرور تغییر کرده است؛ انتخاب دستی لازم است.' } };
      }
      const next = revision + 1, now = Date.now();
      await connection.execute('UPDATE hooshyar_sync_state SET revision=?,payload=?,updated_at=? WHERE id=1', [next, data.payload, now]);
      await connection.execute('INSERT INTO hooshyar_sync_ops (operation_id,revision,created_at) VALUES (?,?,?)', [data.operationId, next, now]);
      await connection.commit(); transaction = false;
      return { ok: true, driver, version: next, updatedAt: now };
    } catch (error) {
      if (transaction) { try { await connection.rollback(); } catch (_) {} }
      throw error;
    } finally { connection.release(); }
  }

  async function pushSqlServer(data) {
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const stateResult = await new sql.Request(tx).query('SELECT revision,payload,updated_at FROM dbo.hooshyar_sync_state WITH (UPDLOCK,HOLDLOCK) WHERE id=1');
      const row = stateResult.recordset[0];
      if (!row) throw new Error('ردیف همگام‌سازی پیدا نشد.');
      const opResult = await new sql.Request(tx)
        .input('operationId', sql.VarChar(100), data.operationId)
        .query('SELECT revision FROM dbo.hooshyar_sync_ops WHERE operation_id=@operationId');
      if (opResult.recordset.length) {
        await tx.commit();
        return { ok: true, driver, version: Number(opResult.recordset[0].revision), idempotent: true };
      }
      const revision = Number(row.revision);
      if (revision !== data.expected) {
        await tx.rollback();
        return { statusCode: 409, body: { ok: false, conflict: true, version: revision, state: parseStatePayload(row.payload), error: 'نسخهٔ سرور تغییر کرده است؛ انتخاب دستی لازم است.' } };
      }
      const next = revision + 1, now = Date.now();
      await new sql.Request(tx)
        .input('revision', sql.BigInt, next)
        .input('payload', sql.NVarChar(sql.MAX), data.payload)
        .input('updatedAt', sql.BigInt, now)
        .query('UPDATE dbo.hooshyar_sync_state SET revision=@revision,payload=@payload,updated_at=@updatedAt WHERE id=1');
      await new sql.Request(tx)
        .input('operationId', sql.VarChar(100), data.operationId)
        .input('revision', sql.BigInt, next)
        .input('createdAt', sql.BigInt, now)
        .query('INSERT INTO dbo.hooshyar_sync_ops (operation_id,revision,created_at) VALUES (@operationId,@revision,@createdAt)');
      await tx.commit();
      return { ok: true, driver, version: next, updatedAt: now };
    } catch (error) {
      try { await tx.rollback(); } catch (_) {}
      throw error;
    }
  }

  return {
    driver,
    async status() {
      const current = await currentState();
      return { ok: true, driver, version: current.version, initialized: current.initialized, updatedAt: current.updatedAt };
    },
    async pull() { return currentState(); },
    async push(input) {
      await ready();
      const data = validatePush(input);
      return driver === 'mysql' ? pushMysql(data) : pushSqlServer(data);
    },
    async close() {
      if (!pool) return;
      if (driver === 'mysql') await pool.end();
      else await pool.close();
      pool = null; initializing = null;
    }
  };
}

module.exports = { createSyncStore, validatePush, parseStatePayload };
