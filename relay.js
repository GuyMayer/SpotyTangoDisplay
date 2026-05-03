#!/usr/bin/env node
// relay.js — SpotyTangoDisplay local network relay server
// No external dependencies. Requires Node.js v14+.
//
// Usage:
//   node relay.js
//
// Then on the DJ laptop open:       http://localhost:PORT/
// On the display screen open:       http://192.168.1.x:PORT/display.html
//
// Tries port 3456 first, then 3457–3465 if busy.
// The console prints the exact URLs to use.

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const BASE_PORT = parseInt(process.env.PORT || '3456', 10);
const MAX_TRIES = 10;
const ROOT      = __dirname;  // serve files from same dir as relay.js

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

const clients  = new Set();
let _lastState = null;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  // -- API routes -----------------------------------------------------------

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
      if (body.length > 65536) { req.destroy(); return; }
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

  // -- Static file server ---------------------------------------------------

  let urlPath = req.url.split('?')[0];  // strip query string
  if (urlPath === '/') urlPath = '/index.html';

  // Prevent path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      else                       res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

function _printUrls(port) {
  const nets = os.networkInterfaces();
  console.log('\nSpotyTangoDisplay Local Relay  (port ' + port + ')');
  console.log('─'.repeat(50));
  console.log('Open the DJ control app on THIS laptop:');
  console.log('  http://localhost:' + port + '/');
  console.log('\nOpen the display screen on the dancer TV / another device:');
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log('  http://' + addr.address + ':' + port + '/display.html');
      }
    }
  }
  console.log('\n⚠  Register this as your Spotify redirect URI:');
  console.log('   http://localhost:' + port + '/');
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
