// audd.js — AudD music recognition API client + browser mic capture
// https://audd.io — POST audio clip, receive song identification

const AudD = (() => {
  const STORAGE_KEY      = 'spotd_audd_key';
  const RECORD_MS         = 8000;   // 8s clip
  const API_URL           = 'https://api.audd.io/';
  const SILENCE_THRESHOLD = 0.012;  // RMS below this = no audio input
  const SILENCE_CHECK_MS  = 1500;   // sample for 1.5s before committing

  let _stream = null;

  // ── Key storage ───────────────────────────────────────────────────────────

  function getKey()  { return localStorage.getItem(STORAGE_KEY) || ''; }
  function setKey(k) {
    if (k && k.trim()) localStorage.setItem(STORAGE_KEY, k.trim());
    else                localStorage.removeItem(STORAGE_KEY);
  }

  // ── Silence detection ────────────────────────────────────────────────────

  // Resolves true if audio level is above threshold, false if silent
  function _hasAudio(stream) {
    return new Promise(resolve => {
      let ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const source   = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let maxRms = 0;
        const iv = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          if (rms > maxRms) maxRms = rms;
        }, 80);
        setTimeout(() => {
          clearInterval(iv);
          try { source.disconnect(); ctx.close(); } catch (_) {}
          resolve(maxRms >= SILENCE_THRESHOLD);
        }, SILENCE_CHECK_MS);
      } catch (_) {
        // AudioContext unavailable — proceed anyway
        if (ctx) try { ctx.close(); } catch (_) {}
        resolve(true);
      }
    });
  }

  // ── Mic capture ───────────────────────────────────────────────────────────

  async function _getStream() {
    if (_stream && _stream.active) return _stream;
    _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return _stream;
  }

  function _record(stream, ms) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      mr.onstop  = () => resolve(new Blob(chunks, { type: mr.mimeType }));
      mr.onerror = e  => reject(e.error || new Error('MediaRecorder error'));
      mr.start();
      setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, ms);
    });
  }

  // ── Recognition ───────────────────────────────────────────────────────────

  // Returns the raw AudD JSON response:
  //   { status: 'success', result: { artist, title, release_date, ... } }
  //   { status: 'success', result: null }  — no match
  //   { status: 'error',   error: { error_code, error_message } }
  async function recognize() {
    const key = getKey();
    if (!key) throw new Error('AudD API key not set');

    const stream = await _getStream();

    // Check for audio input before committing to a full recording
    const audioPresent = await _hasAudio(stream);
    if (!audioPresent) return { status: 'no-audio', result: null };

    const blob   = await _record(stream, RECORD_MS);

    const form = new FormData();
    form.append('api_token', key);
    form.append('audio', blob, 'clip.webm');
    form.append('return', 'spotify');

    const resp = await fetch(API_URL, { method: 'POST', body: form });
    if (!resp.ok) throw new Error('AudD HTTP ' + resp.status);
    return resp.json();
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  function releaseStream() {
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  }

  return { getKey, setKey, recognize, releaseStream };
})();
