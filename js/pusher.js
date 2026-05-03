// pusher.js — Pusher relay send/receive wrapper
//
// Send path  (DJ control app):
//   Uses Pusher HTTP REST API directly with app_id + key + secret from localStorage.
//   Signs requests with HMAC-SHA256 via Web Crypto — no server required.
//
// Receive path (Display app):
//   Subscribes to a plain public channel using Pusher JS SDK (key only, no secret).
//
// Channel: tango-{roomCode}  (public, no auth endpoint needed)
// Event:   track-update

const PusherRelay = (() => {
  const S = {
    roomCode: 'spotd_room_code',
    key:      'spotd_pusher_key',
    secret:   'spotd_pusher_secret',
    appId:    'spotd_pusher_app_id',
    cluster:  'spotd_pusher_cluster',
  };

  let _pusher = null;
  let _channel = null;
  let _onMessage = null;
  let _onStatusChange = null;

  // -- Room code -------------------------------------------------------------

  function getRoomCode() {
    let code = localStorage.getItem(S.roomCode);
    if (!code) {
      code = _generateRoomCode();
      localStorage.setItem(S.roomCode, code);
    }
    return code;
  }

  function _generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => chars[b % chars.length]).join('');
  }

  function getDisplayUrl() {
    const base = window.location.origin +
      window.location.pathname.replace(/[^/]*$/, '');
    return base + 'display.html?room=' + getRoomCode();
  }

  // -- Credentials -----------------------------------------------------------

  function saveCredentials({ key, secret, appId, cluster }) {
    localStorage.setItem(S.key,    key);
    localStorage.setItem(S.secret, secret);
    localStorage.setItem(S.appId,  appId);
    localStorage.setItem(S.cluster, cluster || 'eu');
  }

  function getCredentials() {
    return {
      key:     localStorage.getItem(S.key)     || '',
      secret:  localStorage.getItem(S.secret)  || '',
      appId:   localStorage.getItem(S.appId)   || '',
      cluster: localStorage.getItem(S.cluster) || 'eu',
    };
  }

  function hasCredentials() {
    const c = getCredentials();
    return !!(c.key && c.secret && c.appId);
  }

  // -- HMAC-SHA256 (Web Crypto) ----------------------------------------------

  async function _hmacSha256(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Minimal MD5 — Pusher REST API requires body_md5; Web Crypto lacks MD5.
  function _md5(str) {
    function safeAdd(x, y) { const lsw = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff); }
    function bitRotL(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
    function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotL(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
    function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function str2binl(str) {
      const bin = [];
      for (let i = 0; i < str.length * 8; i += 8) bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xff) << (i % 32);
      return bin;
    }
    function binl2hex(b) {
      const hex = '0123456789abcdef'; let str = '';
      for (let i = 0; i < b.length * 4; i++) str += hex[(b[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf] + hex[(b[i >> 2] >> ((i % 4) * 8)) & 0xf];
      return str;
    }
    function binlMD5(x, len) {
      x[len >> 5] |= 0x80 << (len % 32); x[(((len + 64) >>> 9) << 4) + 14] = len;
      let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
      for (let i = 0; i < x.length; i += 16) {
        const [oa, ob, oc, od] = [a, b, c, d];
        a=md5ff(a,b,c,d,x[i+0],7,-680876936);  d=md5ff(d,a,b,c,x[i+1],12,-389564586);
        c=md5ff(c,d,a,b,x[i+2],17,606105819);  b=md5ff(b,c,d,a,x[i+3],22,-1044525330);
        a=md5ff(a,b,c,d,x[i+4],7,-176418897);  d=md5ff(d,a,b,c,x[i+5],12,1200080426);
        c=md5ff(c,d,a,b,x[i+6],17,-1473231341);b=md5ff(b,c,d,a,x[i+7],22,-45705983);
        a=md5ff(a,b,c,d,x[i+8],7,1770035416);  d=md5ff(d,a,b,c,x[i+9],12,-1958414417);
        c=md5ff(c,d,a,b,x[i+10],17,-42063);    b=md5ff(b,c,d,a,x[i+11],22,-1990404162);
        a=md5ff(a,b,c,d,x[i+12],7,1804603682); d=md5ff(d,a,b,c,x[i+13],12,-40341101);
        c=md5ff(c,d,a,b,x[i+14],17,-1502002290);b=md5ff(b,c,d,a,x[i+15],22,1236535329);
        a=md5gg(a,b,c,d,x[i+1],5,-165796510);  d=md5gg(d,a,b,c,x[i+6],9,-1069501632);
        c=md5gg(c,d,a,b,x[i+11],14,643717713); b=md5gg(b,c,d,a,x[i+0],20,-373897302);
        a=md5gg(a,b,c,d,x[i+5],5,-701558691);  d=md5gg(d,a,b,c,x[i+10],9,38016083);
        c=md5gg(c,d,a,b,x[i+15],14,-660478335);b=md5gg(b,c,d,a,x[i+4],20,-405537848);
        a=md5gg(a,b,c,d,x[i+9],5,568446438);   d=md5gg(d,a,b,c,x[i+14],9,-1019803690);
        c=md5gg(c,d,a,b,x[i+3],14,-187363961); b=md5gg(b,c,d,a,x[i+8],20,1163531501);
        a=md5gg(a,b,c,d,x[i+13],5,-1444681467);d=md5gg(d,a,b,c,x[i+2],9,-51403784);
        c=md5gg(c,d,a,b,x[i+7],14,1735328473); b=md5gg(b,c,d,a,x[i+12],20,-1926607734);
        a=md5hh(a,b,c,d,x[i+5],4,-378558);     d=md5hh(d,a,b,c,x[i+8],11,-2022574463);
        c=md5hh(c,d,a,b,x[i+11],16,1839030562);b=md5hh(b,c,d,a,x[i+14],23,-35309556);
        a=md5hh(a,b,c,d,x[i+1],4,-1530992060); d=md5hh(d,a,b,c,x[i+4],11,1272893353);
        c=md5hh(c,d,a,b,x[i+7],16,-155497632); b=md5hh(b,c,d,a,x[i+10],23,-1094730640);
        a=md5hh(a,b,c,d,x[i+13],4,681279174);  d=md5hh(d,a,b,c,x[i+0],11,-358537222);
        c=md5hh(c,d,a,b,x[i+3],16,-722521979); b=md5hh(b,c,d,a,x[i+6],23,76029189);
        a=md5hh(a,b,c,d,x[i+9],4,-640364487);  d=md5hh(d,a,b,c,x[i+12],11,-421815835);
        c=md5hh(c,d,a,b,x[i+15],16,530742520); b=md5hh(b,c,d,a,x[i+2],23,-995338651);
        a=md5ii(a,b,c,d,x[i+0],6,-198630844);  d=md5ii(d,a,b,c,x[i+7],10,1126891415);
        c=md5ii(c,d,a,b,x[i+14],15,-1416354905);b=md5ii(b,c,d,a,x[i+5],21,-57434055);
        a=md5ii(a,b,c,d,x[i+12],6,1700485571); d=md5ii(d,a,b,c,x[i+3],10,-1894986606);
        c=md5ii(c,d,a,b,x[i+10],15,-1051523);  b=md5ii(b,c,d,a,x[i+1],21,-2054922799);
        a=md5ii(a,b,c,d,x[i+8],6,1873313359);  d=md5ii(d,a,b,c,x[i+15],10,-30611744);
        c=md5ii(c,d,a,b,x[i+6],15,-1560198380);b=md5ii(b,c,d,a,x[i+13],21,1309151649);
        a=md5ii(a,b,c,d,x[i+4],6,-145523070);  d=md5ii(d,a,b,c,x[i+11],10,-1120210379);
        c=md5ii(c,d,a,b,x[i+2],15,718787259);  b=md5ii(b,c,d,a,x[i+9],21,-343485551);
        a=safeAdd(a,oa); b=safeAdd(b,ob); c=safeAdd(c,oc); d=safeAdd(d,od);
      }
      return [a, b, c, d];
    }
    // Convert to UTF-8 bytes so multi-byte characters (accented artist names etc.)
    // produce the same byte sequence as the actual HTTP body.
    const utf8Bytes = new TextEncoder().encode(str);
    let byteStr = '';
    for (let i = 0; i < utf8Bytes.length; i++) byteStr += String.fromCharCode(utf8Bytes[i]);
    return binl2hex(binlMD5(str2binl(byteStr), byteStr.length * 8));
  }

  // Cloudflare Worker that proxies to Pusher REST API with CORS headers
  const RELAY_URL = 'https://pusher-relay.zoom-photo-co-uk.workers.dev';

  // -- Send via Pusher REST API (via CORS relay) -----------------------------

  async function send(payload) {
    const { key, secret, appId, cluster } = getCredentials();
    if (!key || !secret || !appId) {
      console.warn('PusherRelay: credentials not configured');
      return false;
    }

    const channelName = CONFIG.pusher.channelPrefix + getRoomCode();
    const body = JSON.stringify({
      name: CONFIG.pusher.event,
      channel: channelName,
      data: JSON.stringify(payload),
    });

    const bodyMd5 = _md5(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = '/apps/' + appId + '/events';

    const sigParams = new URLSearchParams({
      auth_key: key,
      auth_timestamp: timestamp,
      auth_version: '1.0',
      body_md5: bodyMd5,
    });
    sigParams.sort();
    const qs = sigParams.toString();
    const authSig = await _hmacSha256(secret, 'POST\n' + path + '\n' + qs);
    const url = RELAY_URL + path + '?' + qs + '&auth_signature=' + authSig + '&_cluster=' + cluster;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        console.error('PusherRelay send failed:', res.status, await res.text());
        return false;
      }
      return true;
    } catch (err) {
      console.error('PusherRelay send error:', err);
      return false;
    }
  }

  // -- Subscribe (display side) — key only, public channel ------------------

  function subscribe({ roomCode, key, cluster, onMessage, onStatusChange } = {}) {
    _onMessage = onMessage || null;
    _onStatusChange = onStatusChange || null;

    const rc = roomCode || new URLSearchParams(window.location.search).get('room');
    const k  = key     || localStorage.getItem(S.key)     || CONFIG.pusher.appKey;
    const cl = cluster || localStorage.getItem(S.cluster) || CONFIG.pusher.cluster;

    if (!rc) { _notifyStatus('error', 'No room code'); return false; }
    if (!k)  { _notifyStatus('error', 'No Pusher key'); return false; }

    unsubscribe();

    _pusher = new Pusher(k, { cluster: cl });
    const _thisInstance = _pusher;
    _pusher.connection.bind('state_change', ({ current }) => {
      // Ignore events from a stale instance (unsubscribe() was called before this fires)
      if (_thisInstance !== _pusher) return;
      if (current === 'connected')                   _notifyStatus('connected',    'Live');
      else if (current === 'disconnected')           _notifyStatus('disconnected', 'Connection lost');
      else if (current === 'failed')                 _notifyStatus('error',        'Connection failed');
      else if (current === 'unavailable')            _notifyStatus('error',        'Unavailable');
      else if (current === 'connecting')             _notifyStatus('',             'Connecting…');
    });

    _channel = _pusher.subscribe(CONFIG.pusher.channelPrefix + rc);
    if (_onMessage) _channel.bind(CONFIG.pusher.event, _onMessage);

    return true;
  }

  function unsubscribe() {
    if (_channel) { _channel.unbind_all(); _channel = null; }
    if (_pusher)  { _pusher.disconnect();  _pusher = null; }
  }

  function _notifyStatus(state, msg) {
    if (_onStatusChange) _onStatusChange(state, msg);
  }

  function getState() {
    return _pusher ? _pusher.connection.state : 'disconnected';
  }

  // -- Test credentials ------------------------------------------------------

  async function test({ key, secret, appId, cluster }) {
    const body = JSON.stringify({ name: 'ping', channel: 'tango-test', data: '{}' });
    const bodyMd5 = _md5(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = '/apps/' + appId + '/events';
    const sigParams = new URLSearchParams({
      auth_key: key, auth_timestamp: timestamp, auth_version: '1.0', body_md5: bodyMd5,
    });
    sigParams.sort();
    const qs = sigParams.toString();
    const sig = await _hmacSha256(secret, 'POST\n' + path + '\n' + qs);
    const url = RELAY_URL + path + '?' + qs + '&auth_signature=' + sig + '&_cluster=' + (cluster || 'eu');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      return (res.ok || res.status === 400)
        ? { ok: true }
        : { ok: false, error: 'HTTP ' + res.status + ': ' + await res.text() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // -- Public API ------------------------------------------------------------

  return {
    send,
    subscribe,
    unsubscribe,
    getRoomCode,
    getDisplayUrl,
    getState,
    getCredentials,
    saveCredentials,
    hasCredentials,
    test,
  };
})();
