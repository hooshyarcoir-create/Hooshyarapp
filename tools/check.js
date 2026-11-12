#!/usr/bin/env node
/**
 * Dependency-free logic checks. Runs the real browser modules in a tiny VM
 * sandbox (no jsdom / no browser needed): npm test
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'webapp', 'js');
const mem = {};
const localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
const sandbox = {
  console, Date, Math, Intl, JSON, Promise, Error, RegExp, Number, String, Array, Object,
  Uint8Array, Uint32Array, DataView, Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  btoa, atob, setTimeout, clearTimeout, setInterval: () => 0,
  localStorage,
  document: { fonts: null, getElementById: () => null, createElement: () => ({ getContext: () => null }) },
  navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('offline'))
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let failed = 0, passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function load(file) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename:file }); check('load ' + file, true); }
  catch (e) { check('load ' + file, false, e.stack); throw e; }
}

console.log('\nHooshyar POS — logic checks\n');
['core.js', 'printing.js', 'payments.js'].forEach(load);
const A = sandbox.App;

console.log('\ncrypto');
for (const s of ['', 'abc', '1234', 'سلام دنیا', 'a'.repeat(1000)]) {
  check('sha256(' + JSON.stringify(s.slice(0, 10)) + ')',
    A.util.sha256(s) === crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
}

console.log('\nseed & storage');
A.store.load();
const d = A.store.data;
check('16 tables / 3 halls', d.tables.length === 16 && d.halls.length === 3);
check('18 products / 5 groups', d.products.length === 18 && d.groups.length === 5);
check('3 print stations', d.stations.length === 3);
check('invoice + 58mm + 80mm printers', d.printers.length === 5 && d.printers.some(p => p.width === 58) && d.printers.some(p => p.width === 80));
check('USB & bluetooth & IP printers', ['network','usb','bluetooth'].every(k => d.printers.some(p => p.kind === k)));
check('4 PSP presets', d.psps.length === 4);
check('4 users with distinct roles', d.users.length === 4 && new Set(d.users.map(u => u.role)).size === 4);
check('auto snapshot created', d.snapshots.length === 1);
A.store.saveNow();
check('localStorage persisted', !!localStorage.getItem('hooshyar.pos.data.v1'));

console.log('\nauth & permissions');
check('admin password works', A.auth.login('admin', '1234', false));
check('admin has all permissions', A.ALL_PERMISSIONS.every(p => A.auth.can(p)));
A.auth.logout();
check('wrong password rejected', !A.auth.login('admin', '0000', false));
check('waiter login', A.auth.login('waiter', '3333', false));
check('waiter can send to kitchen', A.auth.can('order.send'));
check('waiter cannot settle', !A.auth.can('payment.settle'));
check('waiter cannot manage users', !A.auth.can('users.manage'));
A.auth.logout(); A.auth.login('admin', '1234', false);

console.log('\norders & totals');
const demo = A.model.order('o-demo');
check('demo order has 3 lines', demo.lines.length === 3);
const t = A.model.totals(demo);
check('subtotal = 530000', t.subtotal === 530000, t.subtotal);
check('total >= subtotal', t.total >= t.subtotal);
const o = A.model.createOrder('t1', 'سالن');
A.model.addLine(o, 'p1'); A.model.addLine(o, 'p1');
check('addLine merges duplicates', o.lines.length === 1 && o.lines[0].qty === 2);
check('table marked occupied', A.model.table('t1').status === 'occupied');
A.store.commit(() => { o.discount = { type:'percent', value:10 }; });
const td = A.model.totals(o);
check('percent discount applied', td.discount === Math.round(td.subtotal * 0.1), td.discount);

console.log('\nدنگی / split');
for (const mode of ['none', 'equal', 'custom', 'items']) {
  const split = { mode, heads:3, custom:[100, 200, 300], items:{ l1:0, l2:1, l3:2 } };
  const shares = A.pay.shares(demo, split);
  check(mode + ' shares sum to total', A.util.sum(shares, s => s.amount) === A.model.totals(demo).total, shares.map(s => s.amount).join(','));
}

console.log('\npayments & settlement');
const total = A.model.totals(demo).total;
check('pays cash', A.pay.addPayment(demo, { method:'cash', amount:Math.floor(total/2) }).ok);
check('pays card', A.pay.addPayment(demo, { method:'card', amount:total - Math.floor(total/2), pspName:'تست' }).ok);
check('fully paid', A.model.remaining(demo) === 0);
const settled = A.pay.settle(demo);
check('invoice issued', settled.ok);
check('invoice archived', A.store.data.invoices.length === 2);
check('table freed', A.model.table('t5').status === 'free');
check('credit customer balance updated on credit payments', A.pay.customers().length >= 1);

console.log('\nprinting');
const inv = settled.invoice;
check('invoice rows (80)', A.print.invoiceRows(inv, 80).length > 10);
check('invoice rows (58)', A.print.invoiceRows(inv, 58).length > 10);
check('receipt html contains restaurant', A.print.receiptHtml(inv, 80).includes('رستوران'));
check('finder picks 80mm invoice printer', A.print.findPrinter(80, 'invoice') !== null);
check('finder picks 58mm invoice printer', A.print.findPrinter(58, 'invoice') !== null);
const tickets = A.print.kitchenTickets(demo, { reprint:true });
check('3 kitchen tickets for 3 lines/stations', tickets.length === 3, tickets.map(x => x.stationName).join('|'));
check('every ticket has a printerId', tickets.every(x => !!x.printerId));
check('kitchen rows non-empty', tickets.every(x => A.print.kitchenRows(x, 80).length > 5));
check('group -> station routing', (A.model.group('g4').stationIds || []).indexOf('s-bar') !== -1);

console.log('\nbackup');
const json = A.store.export();
check('export is valid JSON', JSON.parse(json).invoices.length === 2);
A.store.import(json);
check('import roundtrip', A.store.data.invoices.length === 2);
let threw = false;
try { A.store.import('{"broken":true}'); } catch (e) { threw = true; }
check('invalid backup rejected', threw);

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
