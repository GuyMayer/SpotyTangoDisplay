// tanda.js — Tanda position tracking (history-based)
// A tanda is a set of dance tracks between cortinas.
// Tracks tanda position using playback history stored in sessionStorage.

const Tanda = (() => {
  const STORAGE_HISTORY = 'spotd_tanda_history'; // array of track entries

  // Max history to keep (prevents unbounded growth)
  const MAX_HISTORY = 200;

  /**
   * History entry shape:
   * { trackId, isCortina, timestamp }
   */

  function _getHistory() {
    const stored = sessionStorage.getItem(STORAGE_HISTORY);
    return stored ? JSON.parse(stored) : [];
  }

  function _saveHistory(history) {
    sessionStorage.setItem(STORAGE_HISTORY, JSON.stringify(history.slice(-MAX_HISTORY)));
  }

  /**
   * Record a new track event. Call this when a track changes.
   * @param {string} trackId
   * @param {boolean} isCortina
   */
  function record(trackId, isCortina) {
    const history = _getHistory();

    // Avoid duplicate consecutive entries
    const last = history[history.length - 1];
    if (last && last.trackId === trackId) return;

    history.push({ trackId, isCortina, timestamp: Date.now() });
    _saveHistory(history);
  }

  /**
   * Get the current tanda position for a given track.
   * Returns { position, total } where:
   * - position = which track within the current tanda (1-based)
   * - total = estimated tanda length (null if unknown)
   *
   * Approach: scan backwards from end of history to find the most recent
   * cortina boundary, then count dance tracks since then.
   */
  function getPosition(currentTrackId) {
    const history = _getHistory();

    // Find the slice of dance tracks in the current tanda
    // Walk backwards until we hit a cortina or the start of history
    let tandaStart = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].isCortina) {
        tandaStart = i + 1;
        break;
      }
    }

    const tandaTracks = history.slice(tandaStart);
    const danceTracks = tandaTracks.filter(t => !t.isCortina);

    // Find current position in dance tracks
    const currentIndex = danceTracks.findIndex(t => t.trackId === currentTrackId);
    const position = currentIndex >= 0 ? currentIndex + 1 : danceTracks.length;

    // Estimate tanda length from history of previous tandas
    const total = _estimateTandaLength(history, tandaStart);

    return { position, total };
  }

  /**
   * Estimate typical tanda length by looking at previous complete tandas.
   */
  function _estimateTandaLength(history, currentTandaStart) {
    // Collect lengths of previous complete tandas (between cortinas)
    const lengths = [];
    let segStart = null;
    let segCount = 0;

    for (let i = 0; i < currentTandaStart; i++) {
      const entry = history[i];
      if (!entry.isCortina) {
        if (segStart === null) segStart = i;
        segCount++;
      } else {
        if (segCount > 0) {
          lengths.push(segCount);
          segStart = null;
          segCount = 0;
        }
      }
    }

    if (lengths.length === 0) return null;

    // Mode of observed tanda lengths (most common)
    const freq = {};
    lengths.forEach(l => { freq[l] = (freq[l] || 0) + 1; });
    let mode = null, maxFreq = 0;
    for (const [len, count] of Object.entries(freq)) {
      if (count > maxFreq) { maxFreq = count; mode = parseInt(len, 10); }
    }
    return mode;
  }

  /**
   * Call this at the start of a new cortina to signal tanda boundary.
   */
  function onCortina(trackId) {
    record(trackId, true);
  }

  /**
   * Reset all tanda history (e.g. at session start).
   */
  function reset() {
    sessionStorage.removeItem(STORAGE_HISTORY);
    sessionStorage.removeItem(STORAGE_TANDA_TYPES);
    _currentTandaGenre = null;
  }

  // ── Tanda-type history (for sequence display) ──────────────────────────────
  // Tracks the genre of each completed tanda, so we can show dancers where they
  // are in the rotation pattern (e.g. T T M T T V).

  const STORAGE_TANDA_TYPES = 'spotd_tanda_types'; // sessionStorage: array of genres
  let _currentTandaGenre = null;                    // genre of the currently-playing tanda

  function _getTandaTypes() {
    const stored = sessionStorage.getItem(STORAGE_TANDA_TYPES);
    return stored ? JSON.parse(stored) : [];
  }

  function _saveTandaTypes(types) {
    sessionStorage.setItem(STORAGE_TANDA_TYPES, JSON.stringify(types.slice(-50)));
  }

  /**
   * Set the genre of the currently-playing tanda.
   * Called on every track change with the detected genre.
   * @param {string|null} genre - 'Tango' | 'Milonga' | 'Vals' | null
   */
  function setCurrentTandaGenre(genre) {
    _currentTandaGenre = genre || null;
  }

  /**
   * Called when a cortina is detected — the previous tanda is complete.
   * Pushes the previous tanda's genre onto the history.
   */
  function recordTandaBoundary() {
    if (_currentTandaGenre) {
      const types = _getTandaTypes();
      types.push(_currentTandaGenre);
      _saveTandaTypes(types);
    }
    _currentTandaGenre = null;
  }

  /**
   * Build the sequence display from tanda-type history + rotation pattern.
   * @param {string[]} rotation - e.g. ['Tango','Tango','Milonga','Tango','Tango','Vals']
   * @returns {{sequence: string[], index: number, nextGenre: string|null}}
   *   sequence  - full rotation array (genres)
   *   index     - 0-based index of current tanda in the rotation
   *   nextGenre - predicted next tanda genre (rotation[index+1] or wrap)
   */
  function getSequence(rotation) {
    if (!Array.isArray(rotation) || rotation.length === 0) {
      return { sequence: [], index: -1, nextGenre: null };
    }

    const history = _getTandaTypes();   // completed tandas
    const len = rotation.length;

    // Find our position in the rotation by matching history against rotation
    // Walk forward through rotation, consuming history entries that match.
    let rotIdx = 0;
    for (const histGenre of history) {
      // Advance rotation index to next slot matching histGenre
      for (let step = 1; step <= len; step++) {
        const candidate = rotation[(rotIdx + step) % len];
        if (candidate === histGenre) {
          rotIdx = (rotIdx + step) % len;
          break;
        }
      }
    }

    // Current tanda: if we have a current genre, advance to its slot
    if (_currentTandaGenre) {
      for (let step = 1; step <= len; step++) {
        const candidate = rotation[(rotIdx + step) % len];
        if (candidate === _currentTandaGenre) {
          rotIdx = (rotIdx + step) % len;
          break;
        }
      }
    }

    const nextGenre = rotation[(rotIdx + 1) % len] || null;
    return { sequence: rotation.slice(), index: rotIdx, nextGenre };
  }

  return {
    record,
    getPosition,
    onCortina,
    reset,
    setCurrentTandaGenre,
    recordTandaBoundary,
    getSequence,
  };
})();
