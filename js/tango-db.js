// tango-db.js — Offline tango track lookup
// Source: el-recodo.com + tango.info via galanakis/tangomusicdb
// ~20k entries keyed by normalised "title|orchestra" → {t:'T'/'M'/'V', y:'1940'}
// Per-track type overrides stored in localStorage under spotd_track_types

const TangoDB = (() => {
  const STORAGE_OVERRIDES = 'spotd_track_types';
  const DB_URL = 'data/tango-db.json';
  const TYPE_LABELS = { T: 'Tango', M: 'Milonga', V: 'Vals' };

  let _db = null;        // loaded JSON map
  let _loading = null;   // in-flight promise

  // ── Normalise to match DB keys ─────────────────────────────────────────────

  function _norm(s) {
    if (!s) return '';
    // Decompose unicode, strip combining marks (accents)
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.toLowerCase();
    s = s.replace(/[^a-z0-9 ]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  // ── DB load ────────────────────────────────────────────────────────────────

  async function _load() {
    if (_db) return _db;
    if (_loading) return _loading;
    _loading = fetch(DB_URL)
      .then(r => r.json())
      .then(data => { _db = data; _loading = null; return _db; })
      .catch(() => { _db = {}; _loading = null; return _db; });
    return _loading;
  }

  // ── Per-track memory overrides ─────────────────────────────────────────────

  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_OVERRIDES) || '{}'); } catch { return {}; }
  }

  function setOverride(trackId, type) {
    // type: 'Tango'|'Milonga'|'Vals'|null (null = clear)
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

  /**
   * Look up a track in the DB.
   * @param {string} title   - track name from Spotify
   * @param {string} artist  - artist name from Spotify
   * @param {string} trackId - Spotify track ID (for override check)
   * @returns {{ type: string|null, year: string|null, source: string }}
   *   type: 'Tango'|'Milonga'|'Vals'|null  year: '1942'|null  source: 'override'|'db'|'none'
   */
  async function lookup(title, artist, trackId) {
    // 1. Per-track memory override wins
    const override = getOverride(trackId);
    if (override) {
      const dbEntry = await _dbMatch(title, artist);
      return { type: override, year: dbEntry ? dbEntry.y || null : null, source: 'override' };
    }

    // 2. DB lookup
    const entry = await _dbMatch(title, artist);
    if (entry) {
      return { type: TYPE_LABELS[entry.t] || null, year: entry.y || null, source: 'db' };
    }

    return { type: null, year: null, source: 'none' };
  }

  async function _dbMatch(title, artist) {
    const db = await _load();
    const t = _norm(title);
    const a = _norm(artist);
    // Primary: exact title|artist
    const entry = db[t + '|' + a];
    if (entry) return entry;
    // Fallback: try just title (helps when Spotify artist name differs slightly)
    // Only use if there's exactly one matching entry in the DB
    // (avoid false matches for common titles like "La Cumparsita")
    return null;
  }

  // ── Synchronous lookup (from in-memory cache only) ─────────────────────────

  function lookupSync(title, artist, trackId) {
    const override = getOverride(trackId);
    if (override) {
      const t = _norm(title);
      const a = _norm(artist);
      const entry = _db && _db[t + '|' + a];
      return { type: override, year: entry ? entry.y || null : null, source: 'override' };
    }
    if (!_db) return { type: null, year: null, source: 'none' };
    const t = _norm(title);
    const a = _norm(artist);
    const entry = _db[t + '|' + a];
    if (entry) return { type: TYPE_LABELS[entry.t] || null, year: entry.y || null, source: 'db' };
    return { type: null, year: null, source: 'none' };
  }

  // ── Preload (call on init so first track is instant) ──────────────────────

  function preload() { _load(); }

  return { lookup, lookupSync, setOverride, getOverride, preload };
})();
