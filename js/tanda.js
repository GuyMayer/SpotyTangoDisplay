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
  }

  return {
    record,
    getPosition,
    onCortina,
    reset,
  };
})();
