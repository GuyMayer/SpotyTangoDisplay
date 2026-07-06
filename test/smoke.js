#!/usr/bin/env node
// smoke.js — End-to-end smoke test for relay.js
// Usage: node test/smoke.js
// No external deps. Requires Node.js v14+.

'use strict';

const http       = require('http');
const { spawn }  = require('child_process');
const path       = require('path');
const assert     = require('assert');

const RELAY_PATH = path.join(__dirname, '..', 'relay.js');
const PORT       = parseInt(process.env.PORT || '19456', 10); // test-only port
const BASE       = `http://127.0.0.1:${PORT}`;

let relay;
let passed = 0;
let failed = 0;

// ── Helpers ────────────────────────────────────────────────────────────────

function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const opts = {
      hostname: u.hostname,
      port:     u.port,
      path:     u.pathname + u.search,
      method,
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        : {},
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// Like req() but sends a raw path string (bypasses URL normalisation).
function reqRaw(method, rawPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port:     PORT,
      path:     rawPath,
      method,
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    r.end();
  });
}

function openSse(url) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET' };
    const r = http.request(opts, res => {
      if (res.statusCode !== 200) {
        res.destroy();
        return reject(new Error(`SSE ${res.statusCode}`));
      }
      let buf = '';
      const lines = [];
      res.on('data', chunk => {
        buf += chunk.toString();
        lines.push(chunk.toString());
        // Resolve after receiving the `:ok` keepalive — pass all data seen so far
        if (buf.includes(':ok') && !res._sseResolved) {
          res._sseResolved = true;
          resolve({ res, lines, buf });
        }
      });
      res.on('error', reject);
    });
    r.on('error', reject);
    r.end();
  });
}

function test(name, fn) {
  return fn()
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch(err => { console.error(`  ✗ ${name}: ${err.message}`); failed++; });
}

function waitFor(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Relay startup ──────────────────────────────────────────────────────────

function startRelay() {
  return new Promise((resolve, reject) => {
    relay = spawn(process.execPath, [RELAY_PATH], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    const timeout = setTimeout(() => reject(new Error('Relay startup timeout')), 8000);

    relay.stdout.on('data', chunk => {
      out += chunk;
      if (out.includes('Waiting for connections')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    relay.stderr.on('data', chunk => { out += chunk; });
    relay.on('error', reject);
    relay.on('exit', code => {
      if (code !== null) reject(new Error(`Relay exited with code ${code}:\n${out}`));
    });
  });
}

function stopRelay() {
  if (relay && !relay.killed) relay.kill('SIGTERM');
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\nSpotyTangoDisplay — Smoke Test  (relay on port ${PORT})\n`);

  // 1. /ping
  await test('GET /ping → 200 pong', async () => {
    const r = await req('GET', `${BASE}/ping`);
    assert.strictEqual(r.status, 200, `status ${r.status}`);
    assert.strictEqual(r.body.trim(), 'pong');
  });

  // 2. Control panel
  await test('GET / → 200 HTML', async () => {
    const r = await req('GET', `${BASE}/`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.headers['content-type'].includes('text/html'));
    assert.ok(r.body.includes('<!DOCTYPE html') || r.body.includes('<html'));
  });

  // 3. Display screen
  await test('GET /display.html → 200 HTML', async () => {
    const r = await req('GET', `${BASE}/display.html`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.headers['content-type'].includes('text/html'));
  });

  // 4. Static JS file
  await test('GET /js/config.js → 200 JS', async () => {
    const r = await req('GET', `${BASE}/js/config.js`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.headers['content-type'].includes('javascript'));
  });

  // 5. SSE stream opens and sends keepalive
  await test('GET /events → SSE stream with :ok', async () => {
    const { res } = await openSse(`${BASE}/events`);
    res.destroy();
  });

  // 6. POST /push → 200 + broadcast
  await test('POST /push + SSE receives data', async () => {
    const payload = JSON.stringify({ mode: 'milonga', artist: 'Test' });

    // Open an SSE subscriber first
    let received = '';
    const sseRes = await new Promise((resolve, reject) => {
      const u    = new URL(`${BASE}/events`);
      const opts = { hostname: u.hostname, port: u.port, path: u.pathname };
      const r = http.request(opts, res => {
        res.on('data', c => { received += c.toString(); });
        resolve(res);
      });
      r.on('error', reject);
      r.end();
    });

    await waitFor(100); // let SSE handshake complete

    const pushRes = await req('POST', `${BASE}/push`, payload);
    assert.strictEqual(pushRes.status, 200);
    assert.ok(JSON.parse(pushRes.body).ok);

    await waitFor(200); // let SSE deliver
    sseRes.destroy();

    assert.ok(received.includes('"artist":"Test"'),
      `SSE did not receive pushed data. Got: ${received.slice(0, 200)}`);
  });

  // 7. Last-state replay on new SSE connect (after push)
  await test('New SSE subscriber receives last pushed state', async () => {
    await req('POST', `${BASE}/push`, JSON.stringify({ mode: 'milonga', artist: 'DiSarli' }));
    await waitFor(100);

    // Open raw SSE and collect all data for 300ms (two writes arrive in separate chunks)
    let received = '';
    await new Promise((resolve, reject) => {
      const u = new URL(`${BASE}/events`);
      const r = http.request(
        { hostname: u.hostname, port: u.port, path: u.pathname },
        res => {
          res.on('data', c => { received += c.toString(); });
          res.on('error', reject);
          setTimeout(() => { res.destroy(); resolve(); }, 300);
        }
      );
      r.on('error', reject);
      r.end();
    });

    assert.ok(received.includes('DiSarli'),
      `Last-state replay missing. Got: ${received.slice(0, 200)}`);
  });

  // 8. 404 for unknown file
  await test('GET /nonexistent.xyz → 404', async () => {
    const r = await req('GET', `${BASE}/nonexistent.xyz`);
    assert.strictEqual(r.status, 404);
  });

  // 9. Path traversal → 403
  // Use reqRaw to bypass URL normalisation (new URL() resolves /../ before sending)
  await test('GET /../etc/passwd → 403', async () => {
    const r = await reqRaw('GET', '/../etc/passwd');
    assert.strictEqual(r.status, 403);
  });

  // 10. OPTIONS preflight → 204
  await test('OPTIONS / → 204 CORS preflight', async () => {
    const r = await req('OPTIONS', `${BASE}/`);
    assert.strictEqual(r.status, 204);
    assert.ok(r.headers['access-control-allow-origin']);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    process.stdout.write('Starting relay.js ... ');
    await startRelay();
    console.log('OK');

    await runTests();
  } catch (err) {
    console.error('\nFATAL:', err.message);
    stopRelay();
    process.exit(1);
  }

  stopRelay();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
