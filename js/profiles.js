// profiles.js — Appearance profile CRUD (localStorage)
//
// A profile controls everything visual on the display:
// colors, fonts, field visibility, field order, background,
// branding (DJ name + logo), transitions, and cortina overrides.

const Profiles = (() => {
  const STORAGE_LIST    = 'spotd_profiles';       // JSON array of profile objects
  const STORAGE_ACTIVE  = 'spotd_active_profile'; // profile id string

  // ── Default profile ───────────────────────────────────────────────────────

  const DEFAULT_PROFILE = {
    id: 'default',
    name: 'Default',
    createdAt: null,
    updatedAt: null,

    // Background
    background: {
      type: 'color',          // 'color' | 'image' | 'video'
      color: '#1a0a2e',
      imageData: null,        // base64 data URL
      videoObjectUrl: null,   // object URL (session only — not persisted)
    },
    cortinaBackground: {
      enabled: false,
      type: 'color',
      color: '#0a0a0a',
      imageData: null,
      videoObjectUrl: null,
    },

    // Transition
    transition: {
      style: 'fade',          // 'fade' | 'none'
      durationMs: 600,
    },

    // Branding
    branding: {
      djName: '',             // e.g. "TangoPassion"
      djNameColor: '#ffffff',
      djNameFont: 'Georgia, serif',
      djNameSize: 18,
      djNamePosition: 'bottom-right', // 'top-left'|'top-right'|'bottom-left'|'bottom-right'
      logoData: null,         // base64 data URL
      logoPosition: 'bottom-right',
      logoSize: 80,           // px
      logoOpacity: 0.85,
    },

    // Idle screen
    idle: {
      message: 'Welcome',
      messageColor: '#cccccc',
      messageFont: 'Georgia, serif',
      messageSize: 28,
      showLogo: true,
      showDjName: true,
    },

    // Dance track field config
    danceFields: [
      { id: 'genre',  label: 'Genre',  visible: true, color: '#c8a96e', font: 'Georgia, serif', size: 42, bold: true,  italic: false },
      { id: 'artist', label: 'Artist', visible: true, color: '#ffffff', font: 'Georgia, serif', size: 42, bold: true,  italic: false },
      { id: 'title',  label: 'Title',  visible: true, color: '#dddddd', font: 'Georgia, serif', size: 30, bold: false, italic: true  },
      { id: 'year',   label: 'Rec. Year', visible: true, color: '#999999', font: 'Georgia, serif', size: 18, bold: false, italic: false },
      { id: 'artwork', label: 'Artwork', visible: true, size: 200 },
      { id: 'tanda',  label: 'Tanda',  visible: true, color: '#c8a96e', font: 'Georgia, serif', size: 16, bold: false, italic: false },
    ],

    // Cortina field config (separate visibility/order from dance)
    cortinaFields: [
      { id: 'label',  label: 'Label',  visible: true, color: '#ffffff', font: 'Georgia, serif', size: 64, bold: true,  italic: false },
      { id: 'artist', label: 'Artist', visible: false, color: '#aaaaaa', font: 'Georgia, serif', size: 22, bold: false, italic: false },
      { id: 'title',  label: 'Title',  visible: false, color: '#aaaaaa', font: 'Georgia, serif', size: 18, bold: false, italic: false },
    ],

    // "Coming Up" preview (shown during cortina)
    comingUpFields: [
      { id: 'artist', label: 'Artist', visible: true, color: '#cccccc', font: 'Georgia, serif', size: 22, bold: false, italic: false },
      { id: 'genre',  label: 'Genre',  visible: true, color: '#c8a96e', font: 'Georgia, serif', size: 18, bold: false, italic: false },
    ],

    // Accent / highlight color (used for tanda counter, borders)
    accentColor: '#c8a96e',
  };

  // ── CRUD helpers ──────────────────────────────────────────────────────────

  function _loadAll() {
    const stored = localStorage.getItem(STORAGE_LIST);
    if (!stored) return [_seedDefault()];
    try {
      return _migrate(JSON.parse(stored));
    } catch {
      return [_seedDefault()];
    }
  }

  // Migrate existing saved profiles to current field layout
  function _migrate(profiles) {
    let dirty = false;
    profiles.forEach(p => {
      if (!p.danceFields) return;
      const genre = p.danceFields.find(f => f.id === 'genre');
      if (!genre) return;
      if (genre.size !== 42 || !genre.bold) {
        genre.size = 42;
        genre.bold = true;
        dirty = true;
      }
      const idx = p.danceFields.indexOf(genre);
      if (idx !== 0) {
        p.danceFields.splice(idx, 1);
        p.danceFields.unshift(genre);
        dirty = true;
      }
    });
    if (dirty) _saveAll(profiles);
    return profiles;
  }

  function _saveAll(profiles) {
    localStorage.setItem(STORAGE_LIST, JSON.stringify(profiles));
  }

  function _seedDefault() {
    const p = _clone(DEFAULT_PROFILE);
    p.createdAt = new Date().toISOString();
    p.updatedAt = p.createdAt;
    _saveAll([p]);
    return p;
  }

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _generateId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  // ── Public CRUD ───────────────────────────────────────────────────────────

  function list() {
    return _loadAll();
  }

  function get(id) {
    return _loadAll().find(p => p.id === id) || null;
  }

  function getActive() {
    const id = localStorage.getItem(STORAGE_ACTIVE);
    const all = _loadAll();
    if (id) {
      const found = all.find(p => p.id === id);
      if (found) return found;
    }
    return all[0] || _seedDefault();
  }

  function setActive(id) {
    localStorage.setItem(STORAGE_ACTIVE, id);
  }

  function create(name, baseId) {
    const all = _loadAll();
    const base = baseId ? (all.find(p => p.id === baseId) || DEFAULT_PROFILE) : DEFAULT_PROFILE;
    const p = _clone(base);
    p.id = _generateId();
    p.name = name || 'New Profile';
    p.createdAt = new Date().toISOString();
    p.updatedAt = p.createdAt;
    all.push(p);
    _saveAll(all);
    return p;
  }

  function update(id, changes) {
    const all = _loadAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    // Deep merge top-level keys
    const updated = _deepMerge(all[idx], changes);
    updated.updatedAt = new Date().toISOString();
    all[idx] = updated;
    _saveAll(all);
    return updated;
  }

  function remove(id) {
    const all = _loadAll();
    if (all.length <= 1) return false; // never delete the last profile
    const filtered = all.filter(p => p.id !== id);
    _saveAll(filtered);
    // If deleted profile was active, switch to first
    if (localStorage.getItem(STORAGE_ACTIVE) === id) {
      localStorage.setItem(STORAGE_ACTIVE, filtered[0].id);
    }
    return true;
  }

  function rename(id, name) {
    return update(id, { name });
  }

  function duplicate(id) {
    const src = get(id);
    if (!src) return null;
    return create(src.name + ' (copy)', id);
  }

  // ── Field order helpers ───────────────────────────────────────────────────

  function reorderFields(profileId, fieldType, newOrder) {
    // fieldType: 'danceFields' | 'cortinaFields' | 'comingUpFields'
    const p = get(profileId);
    if (!p || !p[fieldType]) return null;

    const reordered = newOrder.map(id => p[fieldType].find(f => f.id === id)).filter(Boolean);
    // Append any fields not mentioned in newOrder (safety)
    p[fieldType].forEach(f => {
      if (!reordered.find(r => r.id === f.id)) reordered.push(f);
    });
    return update(profileId, { [fieldType]: reordered });
  }

  function updateField(profileId, fieldType, fieldId, changes) {
    const p = get(profileId);
    if (!p || !p[fieldType]) return null;
    const fields = p[fieldType].map(f => f.id === fieldId ? Object.assign({}, f, changes) : f);
    return update(profileId, { [fieldType]: fields });
  }

  // ── Logo / background helpers ─────────────────────────────────────────────

  function setLogo(profileId, dataUrl) {
    return update(profileId, { branding: { logoData: dataUrl } });
  }

  function setBackground(profileId, { type, color, imageData }) {
    return update(profileId, { background: { type, color: color || null, imageData: imageData || null } });
  }

  function setCortinaBackground(profileId, { enabled, type, color, imageData }) {
    return update(profileId, { cortinaBackground: { enabled, type, color: color || null, imageData: imageData || null } });
  }

  // ── Deep merge (one level) ────────────────────────────────────────────────

  function _deepMerge(target, source) {
    const result = _clone(target);
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = Object.assign({}, result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // ── Export / import ───────────────────────────────────────────────────────

  function exportProfile(id) {
    const p = get(id);
    if (!p) return null;
    return JSON.stringify(p, null, 2);
  }

  function importProfile(jsonStr) {
    let p;
    try { p = JSON.parse(jsonStr); } catch { return null; }
    if (!p || !p.name) return null;
    const all = _loadAll();
    p.id = _generateId();
    p.createdAt = new Date().toISOString();
    p.updatedAt = p.createdAt;
    all.push(p);
    _saveAll(all);
    return p;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    list,
    get,
    getActive,
    setActive,
    create,
    update,
    remove,
    rename,
    duplicate,
    reorderFields,
    updateField,
    setLogo,
    setBackground,
    setCortinaBackground,
    exportProfile,
    importProfile,
    DEFAULT_PROFILE,
  };
})();
