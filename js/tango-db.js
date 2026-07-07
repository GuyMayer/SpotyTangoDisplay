// tango-db.js — Offline tango track lookup with remote update + local additions
//
// Priority chain (first match wins):
//   1. Per-Spotify-ID overrides  (spotd_track_types)   — existing
//   2. Local additions           (spotd_local_tracks)  — new: DJ-added tracks
//   3. Cached remote DB          (spotd_db_remote)     — new: latest from GitHub
//   4. Bundled data/tango-db.json                       — always available
//
// Remote update: checks GitHub for a newer version once per day. Downloads
// and merges silently in the background — no impact on startup time.
//
// Local additions: DJ can add/correct tracks (type, year, singer). Stored in
// localStorage. Contributed back to master via relay POST /contribute.

const TangoDB = (() => {
  const STORAGE_OVERRIDES       = 'spotd_track_types';
  const STORAGE_LOCAL_TRACKS    = 'spotd_local_tracks';
  const STORAGE_REMOTE_DB       = 'spotd_db_remote';
  const STORAGE_REMOTE_VERSION  = 'spotd_db_remote_version';
  const STORAGE_LAST_CHECK      = 'spotd_db_last_check';

  const DB_URL             = 'data/tango-db.json';
  const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/GuyMayer/SpotyTangoDisplay/main/data/tango-db-version.txt';
  const REMOTE_DB_URL      = 'https://raw.githubusercontent.com/GuyMayer/SpotyTangoDisplay/main/data/tango-db.json';
  const CHECK_INTERVAL_MS  = 24 * 60 * 60 * 1000; // once per day

  const TYPE_LABELS = { T: 'Tango', M: 'Milonga', V: 'Vals' };
  const TYPE_CHARS  = { Tango: 'T', Milonga: 'M', Vals: 'V' };

  let _db      = null;   // in-memory DB (bundled + remote + local additions merged)
  let _loading = null;   // in-flight load promise

  // ── Normalise to match DB keys ─────────────────────────────────────────────

  function _norm(s) {
    if (!s) return '';
    // Strip common Spotify title suffixes before normalising
    s = s.replace(/\s*[-–([]?\s*(remaster(?:ed|izado)?|live|mono|stereo|version)\b[^)]*[)\]]?/gi, '');
    s = s.replace(/\s*\(\d{4}\s+remaster[^)]*\)/gi, '');
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.toLowerCase();
    s = s.replace(/[^a-z0-9 ]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  // ── Remote DB management ───────────────────────────────────────────────────

  function _getStoredRemoteDb() {
    try { return localStorage.getItem(STORAGE_REMOTE_DB); } catch { return null; }
  }

  function _storeRemoteDb(jsonString, version) {
    try {
      localStorage.setItem(STORAGE_REMOTE_DB, jsonString);
      localStorage.setItem(STORAGE_REMOTE_VERSION, String(version));
    } catch (e) {
      // localStorage quota exceeded — try sessionStorage as fallback
      try {
        sessionStorage.setItem(STORAGE_REMOTE_DB, jsonString);
        localStorage.setItem(STORAGE_REMOTE_VERSION, String(version));
      } catch { /* storage unavailable — silent fail */ }
    }
  }

  function _getStoredVersion() {
    try { return parseInt(localStorage.getItem(STORAGE_REMOTE_VERSION) || '0', 10); } catch { return 0; }
  }

  // Check GitHub for a newer DB version; download if found.
  // Runs in background — never blocks page load.
  async function _checkRemoteVersion() {
    try {
      const lastCheck = parseInt(localStorage.getItem(STORAGE_LAST_CHECK) || '0', 10);
      if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return; // checked recently

      localStorage.setItem(STORAGE_LAST_CHECK, String(Date.now()));

      const resp = await fetch(REMOTE_VERSION_URL, { cache: 'no-cache' });
      if (!resp.ok) return;
      const remoteVersion = parseInt(await resp.text(), 10);
      if (isNaN(remoteVersion) || remoteVersion <= _getStoredVersion()) return;

      console.log('[TangoDB] Remote version', remoteVersion, '— downloading update…');
      const dbResp = await fetch(REMOTE_DB_URL, { cache: 'no-cache' });
      if (!dbResp.ok) return;
      const jsonString = await dbResp.text();
      _storeRemoteDb(jsonString, remoteVersion);

      // Merge into live _db so current session uses new data immediately
      const fresh = JSON.parse(jsonString);
      Object.assign(_db, fresh);
      _overlayLocalAdditions();
      console.log('[TangoDB] Remote DB applied (v' + remoteVersion + ')');
    } catch { /* network unavailable — silent fail */ }
  }

  // ── Local additions ────────────────────────────────────────────────────────
  // Format: { "title|orchestra": { t:'T'/'M'/'V', y:'1947', s:'Singer',
  //                                  added:'2026-07-06', by:'DJ Name' } }

  function getLocalTracks() {
    try { return JSON.parse(localStorage.getItem(STORAGE_LOCAL_TRACKS) || '{}'); } catch { return {}; }
  }

  function _saveLocalTracks(obj) {
    try { localStorage.setItem(STORAGE_LOCAL_TRACKS, JSON.stringify(obj)); } catch { /* quota */ }
  }

  /**
   * Add or update a local track entry.
   * @param {string} title    - track title (will be normalised)
   * @param {string} artist   - orchestra / artist name (will be normalised)
   * @param {{ type?: string, year?: string, singer?: string }} data
   *   type: 'Tango'|'Milonga'|'Vals'
   */
  function addLocalTrack(title, artist, data) {
    const key = _norm(title) + '|' + _norm(artist);
    if (!key || key === '|') return;

    const tracks = getLocalTracks();
    const typeChar = data.type ? (TYPE_CHARS[data.type] || data.type) : undefined;
    const dj = (() => {
      try {
        const p = JSON.parse(localStorage.getItem('spotd_profiles') || '[]');
        const active = localStorage.getItem('spotd_active_profile');
        const prof = p.find(x => x.id === active) || p[0];
        return (prof && prof.branding && prof.branding.name) || 'Anonymous';
      } catch { return 'Anonymous'; }
    })();

    tracks[key] = Object.assign(tracks[key] || {}, {
      ...(typeChar   ? { t: typeChar }     : {}),
      ...(data.year  ? { y: data.year }    : {}),
      ...(data.singer? { s: data.singer }  : {}),
      added: new Date().toISOString().slice(0, 10),
      by: dj,
    });
    _saveLocalTracks(tracks);

    // Update live DB immediately
    if (_db) {
      _db[key] = Object.assign(_db[key] || {}, tracks[key]);
    }
  }

  function removeLocalTrack(key) {
    const tracks = getLocalTracks();
    delete tracks[key];
    _saveLocalTracks(tracks);
    // Note: does not un-merge from _db; reload page to fully remove
  }

  // Overlay all local additions onto _db (called after each load)
  function _overlayLocalAdditions() {
    const local = getLocalTracks();
    for (const [key, entry] of Object.entries(local)) {
      _db[key] = Object.assign(_db[key] || {}, entry);
    }
  }

  // ── DB load ────────────────────────────────────────────────────────────────

  async function _load() {
    if (_db) return _db;
    if (_loading) return _loading;

    _loading = (async () => {
      // 1. Use cached remote DB if available (may be newer than bundled)
      const remoteRaw = _getStoredRemoteDb() ||
                        (() => { try { return sessionStorage.getItem(STORAGE_REMOTE_DB); } catch { return null; } })();
      if (remoteRaw) {
        try {
          _db = JSON.parse(remoteRaw);
          _loading = null;
          _overlayLocalAdditions();
          _checkRemoteVersion(); // background check for even newer version
          return _db;
        } catch { /* corrupt cache — fall through to bundled */ }
      }

      // 2. Fetch bundled file
      try {
        const r = await fetch(DB_URL);
        _db = await r.json();
      } catch { _db = {}; }

      _loading = null;
      _overlayLocalAdditions();
      _checkRemoteVersion(); // background check
      return _db;
    })();

    return _loading;
  }

  // ── Per-track Spotify-ID overrides ────────────────────────────────────────

  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_OVERRIDES) || '{}'); } catch { return {}; }
  }

  function setOverride(trackId, type) {
    const overrides = getOverrides();
    if (type === null) {
      delete overrides[trackId];
    } else {
      overrides[trackId] = type;
    }
    localStorage.setItem(STORAGE_OVERRIDES, JSON.stringify(overrides));
  }

  function getOverride(trackId) {
    if (!trackId) return null;
    return getOverrides()[trackId] || null;
  }

  // ── Lookup ─────────────────────────────────────────────────────────────────

  async function lookup(title, artist, trackId) {
    // 1. Per-Spotify-ID override
    const override = getOverride(trackId);
    if (override) {
      const dbEntry = await _dbMatch(title, artist);
      return { type: override, year: dbEntry ? dbEntry.y || null : null,
               singer: dbEntry ? dbEntry.s || null : null, source: 'override' };
    }
    // 2. DB match (includes local additions + remote data)
    const entry = await _dbMatch(title, artist);
    if (entry) {
      return { type: TYPE_LABELS[entry.t] || null, year: entry.y || null,
               singer: entry.s || null, source: entry.by ? 'local' : 'db' };
    }
    return { type: null, year: null, singer: null, source: 'none' };
  }

  async function _dbMatch(title, artist) {
    const db = await _load();
    const t = _norm(title);
    const a = _norm(artist);
    return db[t + '|' + a] || null;
  }

  // ── Synchronous lookup ────────────────────────────────────────────────────

  function lookupSync(title, artist, trackId) {
    const override = getOverride(trackId);
    if (override) {
      const t = _norm(title);
      const a = _norm(artist);
      const entry = _db && _db[t + '|' + a];
      return { type: override, year: entry ? entry.y || null : null,
               singer: entry ? entry.s || null : null, source: 'override' };
    }
    if (!_db) return { type: null, year: null, singer: null, source: 'none' };
    const t = _norm(title);
    const a = _norm(artist);
    const entry = _db[t + '|' + a];
    if (entry) {
      return { type: TYPE_LABELS[entry.t] || null, year: entry.y || null,
               singer: entry.s || null, source: entry.by ? 'local' : 'db' };
    }
    return { type: null, year: null, singer: null, source: 'none' };
  }

  // ── Search by title across ALL orchestras ────────────────────────────────
  // Returns array of { artist, type, year, singer } sorted by year ascending.
  // Used for song provenance display when the playing orchestra is not in DB.

  function searchByTitle(title) {
    if (!_db || !title) return [];
    const t = _norm(title);
    if (!t) return [];
    const results = [];
    const keys = Object.keys(_db);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const sep = key.indexOf('|');
      if (sep < 0) continue;
      if (key.slice(0, sep) !== t) continue;
      const entry = _db[key];
      results.push({
        artist: key.slice(sep + 1),
        type:   TYPE_LABELS[entry.t] || entry.t || null,
        year:   entry.y ? parseInt(entry.y, 10) : null,
        singer: entry.s || null,
      });
    }
    // Also search local tracks
    const locals = getLocalTracks();
    Object.keys(locals).forEach(key => {
      const sep = key.indexOf('|');
      if (sep < 0) return;
      if (key.slice(0, sep) !== t) return;
      const entry = locals[key];
      results.push({
        artist: key.slice(sep + 1),
        type:   TYPE_LABELS[entry.t] || entry.t || null,
        year:   entry.y ? parseInt(entry.y, 10) : null,
        singer: entry.s || null,
        local:  true,
      });
    });
    results.sort((a, b) => (a.year || 9999) - (b.year || 9999));
    return results;
  }

  // ── Preload ───────────────────────────────────────────────────────────────

  function preload() { _load(); }

  return {
    lookup, lookupSync, searchByTitle,
    setOverride, getOverride,
    addLocalTrack, removeLocalTrack, getLocalTracks,
    preload,
  };
})();
