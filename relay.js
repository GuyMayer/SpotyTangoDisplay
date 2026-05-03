#!/usr/bin/env node
// relay.js — SpotyTangoDisplay local network relay server
// No external dependencies. Requires Node.js v14+.
//
// Usage:
//   node relay.js
//
// Tries port 3456 first, then 3457–3465 if busy.
// The console prints whichever port it binds to.

'use strict';

const http = require('http');
const os   = require('os');

const BASE_PORT = parseInt(process.env.PORT || '3456', 10);
const MAX_TRIES = 10;

const clients  = new Set();
let _lastState = null;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('pong');
    return;
  }

  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(':ok\n\n');
    // Send last known state immediately so the display is current on reconnect
    if (_lastState) res.write('data: ' + _lastState + '\n\n');
    clients.add(res);
    console.log('[relay] + Display connected  (' + clients.size + ' active)');
    req.on('close', () => {
      clients.delete(res);
      console.log('[relay] - Display disconnected (' + clients.size + ' remaining)');
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/push') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) { req.destroy(); return; } // 64 KB guard
    });
    req.on('end', () => {
      _lastState = body;
      let sent = 0;
      for (const c of clients) {
        try   { c.write('data: ' + body + '\n\n'); sent++; }
        catch { clients.delete(c); }
      }
      console.log('[relay] Pushed to ' + sent + ' display(s)');
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
});

function _printUrls(port) {
  const nets = os.networkInterfaces();
  console.log('\nSpotyTangoDisplay Local Relay');
  console.log('─'.repeat(45));
  console.log('Display URL from this machine:');
  console.log('  display.html?host=localhost:' + port);
  console.log('\nDisplay URL from another device on the same WiFi:');
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log('  display.html?host=' + addr.address + ':' + port);
      }
    }
  }
  console.log('\nWaiting for connections...\n');
}

function tryListen(port, triesLeft) {
  server.listen(port, '0.0.0.0')
    .once('listening', () => _printUrls(port))
    .once('error', err => {
      if (err.code === 'EADDRINUSE' && triesLeft > 1) {
        console.warn('[relay] Port ' + port + ' in use, trying ' + (port + 1) + '…');
        server.close();
        tryListen(port + 1, triesLeft - 1);
      } else {
        console.error('[relay] Could not bind to a port:', err.message);
        process.exit(1);
      }
    });
}

tryListen(BASE_PORT, MAX_TRIES);
});
