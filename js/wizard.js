// wizard.js — First-time setup wizard (6 steps)
// Runs on first visit; skips if already configured. Re-runnable from Settings.

const Wizard = (() => {
  const STORAGE_DONE = 'spotd_wizard_done';   // 'true' when completed
  const STORAGE_STEP = 'spotd_wizard_step';   // resume step if closed mid-way

  let _currentStep = 1;
  const TOTAL_STEPS = 10;

  // ── Step definitions ──────────────────────────────────────────────────────

  const STEPS = {
    1: { id: 'welcome',   title: 'Welcome'          },
    2: { id: 'spotify',   title: 'Spotify'          },
    3: { id: 'pusher',    title: 'Display Relay'    },
    4: { id: 'audd',      title: 'Live Recognition' },
    5: { id: 'lastfm',    title: 'Song Stories'     },
    6: { id: 'ai',        title: 'AI Stories'       },
    7: { id: 'branding',  title: 'Branding'         },
    8: { id: 'cortina',   title: 'Cortina Rules'    },
    9: { id: 'design',    title: 'Display Design'   },
    10: { id: 'done',     title: 'Done!'            },
  };

  // ── Public entry points ───────────────────────────────────────────────────

  function isComplete() {
    return localStorage.getItem(STORAGE_DONE) === 'true';
  }

  function runIfNeeded() {
    if (!isComplete()) show();
  }

  function show(startStep) {
    _currentStep = startStep || parseInt(localStorage.getItem(STORAGE_STEP) || '1', 10);
    if (_currentStep < 1 || _currentStep > TOTAL_STEPS) _currentStep = 1;
    _render();
  }

  // ── Modal / overlay ───────────────────────────────────────────────────────

  function _render() {
    _removeExisting();
    const overlay = document.createElement('div');
    overlay.id = 'wizard-overlay';
    overlay.innerHTML = _buildChrome();
    document.body.appendChild(overlay);

    _renderStep(_currentStep);
    _bindNavigation();
    _updateProgress();
  }

  function _removeExisting() {
    const old = document.getElementById('wizard-overlay');
    if (old) old.remove();
  }

  function _buildChrome() {
    return `
      <div id="wizard-modal">
        <div id="wizard-header">
          <div id="wizard-brand">TangoPassion Setup</div>
          <button id="wizard-close" aria-label="Close">✕</button>
        </div>
        <div id="wizard-progress-bar"><div id="wizard-progress-fill"></div></div>
        <div id="wizard-step-label"></div>
        <div id="wizard-body"></div>
        <div id="wizard-footer">
          <button id="wizard-btn-back"  class="wiz-btn secondary">Back</button>
          <button id="wizard-btn-next"  class="wiz-btn primary">Next</button>
          <button id="wizard-btn-done"  class="wiz-btn primary hidden">Open Control Panel</button>
          <button id="wizard-btn-skip"  class="wiz-btn ghost">Skip</button>
        </div>
        <div id="wizard-about">
          <span>Sidekick SpotyMilonga Display</span>
          <a href="https://buymeacoffee.com/studiomailt" target="_blank" rel="noopener" id="wizard-coffee-btn">☕ Buy me a coffee</a>
        </div>
      </div>
    `;
  }

  function _bindNavigation() {
    const get = id => document.getElementById(id);

    get('wizard-close').addEventListener('click', () => {
      _saveStep();
      _removeExisting();
    });

    get('wizard-btn-back').addEventListener('click', () => {
      if (_currentStep > 1) _goTo(_currentStep - 1);
    });

    get('wizard-btn-next').addEventListener('click', () => {
      if (_validateStep(_currentStep)) {
        _saveStepData(_currentStep);
        if (_currentStep < TOTAL_STEPS) _goTo(_currentStep + 1);
      }
    });

    get('wizard-btn-skip').addEventListener('click', () => {
      if (_currentStep < TOTAL_STEPS) _goTo(_currentStep + 1);
    });

    get('wizard-btn-done').addEventListener('click', () => {
      localStorage.setItem(STORAGE_DONE, 'true');
      localStorage.removeItem(STORAGE_STEP);
      _removeExisting();
      // Reload to show control panel
      window.location.reload();
    });
  }

  function _goTo(step) {
    _currentStep = step;
    _saveStep();
    _renderStep(step);
    _updateProgress();
  }

  function _saveStep() {
    localStorage.setItem(STORAGE_STEP, String(_currentStep));
  }

  function _updateProgress() {
    const fill = document.getElementById('wizard-progress-fill');
    const label = document.getElementById('wizard-step-label');
    if (!fill || !label) return;

    const pct = ((_currentStep - 1) / (TOTAL_STEPS - 1)) * 100;
    fill.style.width = pct + '%';
    label.textContent = 'Step ' + _currentStep + ' of ' + TOTAL_STEPS + ' — ' + STEPS[_currentStep].title;

    // Back / next / skip visibility
    const backBtn = document.getElementById('wizard-btn-back');
    const nextBtn = document.getElementById('wizard-btn-next');
    const doneBtn = document.getElementById('wizard-btn-done');
    const skipBtn = document.getElementById('wizard-btn-skip');

    if (backBtn) backBtn.style.visibility = _currentStep === 1 ? 'hidden' : 'visible';
    if (nextBtn) nextBtn.classList.toggle('hidden', _currentStep === TOTAL_STEPS);
    if (doneBtn) doneBtn.classList.toggle('hidden', _currentStep !== TOTAL_STEPS);
    if (skipBtn) {
      // Skip visible on optional steps 4, 5, 6, and 8
      skipBtn.classList.toggle('hidden', ![4, 5, 6, 8, 9].includes(_currentStep));
    }
  }

  // ── Step renderers ────────────────────────────────────────────────────────

  function _renderStep(step) {
    const body = document.getElementById('wizard-body');
    if (!body) return;
    body.innerHTML = '';

    switch (step) {
      case 1: _renderWelcome(body);   break;
      case 2: _renderSpotify(body);   break;
      case 3: _renderPusher(body);    break;
      case 4: _renderAudD(body);      break;
      case 5: _renderLastFm(body);    break;
      case 6: _renderAI(body);        break;
      case 7: _renderBranding(body);  break;
      case 8: _renderCortina(body);   break;
      case 9: _renderDesign(body);    break;
      case 10: _renderDone(body);     break;
    }
  }

  function _renderWelcome(body) {
    body.innerHTML = `
      <div class="wiz-center">
        <div class="wiz-hero-icon">🎶</div>
        <h2>Welcome to TangoPassion Display</h2>
        <p>Show your dancers what's playing — live, on any screen — without any install.</p>
        <p>This 6-step wizard gets you set up in about 5 minutes.</p>
        <ul class="wiz-checklist">
          <li>Connect your Spotify account</li>
          <li>Set up your free Pusher relay (so the dancer screen updates live)</li>
          <li>Add your DJ branding</li>
          <li>Configure cortina detection (optional)</li>
        </ul>
      </div>
    `;
  }

  function _renderSpotify(body) {
    const clientId = localStorage.getItem('spotd_spotify_client_id') || '';
    const loggedIn = Spotify && Spotify.isLoggedIn && Spotify.isLoggedIn();
    const redirectUri = window.location.origin + window.location.pathname.replace(/index\.html$/, '');

    body.innerHTML = `
      <h2>Connect Spotify</h2>

      <div class="wiz-redirect-box">
        <div class="wiz-redirect-label">Redirect URI — add this to your Spotify app</div>
        <div class="wiz-redirect-row">
          <code id="wiz-redirect-uri" class="wiz-redirect-uri">${_esc(redirectUri)}</code>
          <button id="wiz-copy-redirect" class="wiz-btn ghost small">Copy</button>
        </div>
      </div>

      <ol class="wiz-steps-list">
        <li>Open your app in <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a></li>
        <li>Click <strong>Edit Settings</strong></li>
        <li>Under <strong>Redirect URIs</strong>, add the URI above and click <strong>Save</strong></li>
        <li>Paste your <strong>Client ID</strong> below</li>
      </ol>

      <label class="wiz-label">Spotify Client ID
        <input id="wiz-spotify-client-id" class="wiz-input" type="text"
          placeholder="e.g. 1a2b3c4d5e6f..." value="${_esc(clientId)}" autocomplete="off">
      </label>
      <div id="wiz-dashboard-link-row" class="wiz-hint" style="margin-bottom:12px;display:${clientId ? 'block' : 'none'}">
        <a id="wiz-dashboard-link" href="https://developer.spotify.com/dashboard/${_esc(clientId)}" target="_blank" rel="noopener">
          Open this app's settings ↗
        </a> — go to Edit Settings → Redirect URIs
      </div>

      <div id="wiz-spotify-status" class="wiz-status ${loggedIn ? 'ok' : ''}">
        ${loggedIn ? '✓ Spotify connected' : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button id="wiz-spotify-connect" class="wiz-btn primary" ${loggedIn ? 'disabled' : ''}>
          ${loggedIn ? 'Connected' : 'Authorise Spotify'}
        </button>
        <button id="wiz-load-settings-btn" class="wiz-btn ghost small" title="Import a previously exported settings file">Load Settings</button>
        <input id="wiz-load-settings-file" type="file" accept=".json,.skp" style="display:none">
      </div>
    `;

    // Copy redirect URI
    document.getElementById('wiz-copy-redirect').addEventListener('click', () => {
      navigator.clipboard.writeText(redirectUri).then(() => {
        document.getElementById('wiz-copy-redirect').textContent = 'Copied!';
        setTimeout(() => { document.getElementById('wiz-copy-redirect').textContent = 'Copy'; }, 2000);
      });
    });

    // Update dashboard link as user types client ID
    document.getElementById('wiz-spotify-client-id').addEventListener('input', e => {
      const id = e.target.value.trim();
      const row  = document.getElementById('wiz-dashboard-link-row');
      const link = document.getElementById('wiz-dashboard-link');
      if (id.length > 10) {
        link.href = 'https://developer.spotify.com/dashboard/' + encodeURIComponent(id);
        row.style.display = 'block';
      } else {
        row.style.display = 'none';
      }
    });

    document.getElementById('wiz-spotify-connect').addEventListener('click', () => {
      const id = document.getElementById('wiz-spotify-client-id').value.trim();
      if (!id) { _showError('wiz-spotify-status', 'Enter your Client ID first'); return; }
      localStorage.setItem('spotd_spotify_client_id', id);
      CONFIG.spotify.clientId = id;
      Spotify.login();
    });

    document.getElementById('wiz-load-settings-btn').addEventListener('click', () => {
      document.getElementById('wiz-load-settings-file').click();
    });
    document.getElementById('wiz-load-settings-file').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data || typeof data !== 'object') throw new Error('Invalid file');
          const KEYS = [
            'spotd_spotify_client_id', 'spotd_audd_key', 'spotd_lastfm_key',
            'spotd_openrouter_key', 'spotd_mode', 'spotd_format', 'spotd_dance_override',
            'spotd_source', 'spotd_autogen_stories', 'spotd_live_tanda_size', 'spotd_live_tanda_style',
            'spotd_profiles', 'spotd_active_profile', 'spotd_story_overrides', 'spotd_track_types',
            'spotd_cortina_playlist', 'spotd_cortina_tracks', 'spotd_relay_mode', 'spotd_local_host',
          ];
          // Build a normalised copy: remap any non-spotd_ prefix to spotd_
          // e.g. spotm_spotify_client_id → spotd_spotify_client_id
          const normalised = {};
          Object.keys(data).forEach(k => {
            if (k.startsWith('_')) return; // skip _version, _exported
            const remapped = k.startsWith('spotd_') ? k : k.replace(/^[^_]+_/, 'spotd_');
            normalised[remapped] = data[k];
          });
          let count = 0;
          KEYS.forEach(k => { if (k in normalised) { localStorage.setItem(k, normalised[k]); count++; } });
          // Refresh the Client ID field inline
          const restored = localStorage.getItem('spotd_spotify_client_id') || '';
          const input = document.getElementById('wiz-spotify-client-id');
          if (input) input.value = restored;
          if (restored.length > 10) {
            const link = document.getElementById('wiz-dashboard-link');
            const row  = document.getElementById('wiz-dashboard-link-row');
            if (link) link.href = 'https://developer.spotify.com/dashboard/' + encodeURIComponent(restored);
            if (row)  row.style.display = 'block';
          }
          _showError('wiz-spotify-status', '✓ Loaded ' + count + ' settings');
          document.getElementById('wiz-spotify-status').classList.add('ok');
        } catch (err) {
          _showError('wiz-spotify-status', 'Import failed: ' + err.message);
        }
        this.value = '';
      };
      reader.readAsText(file);
    });
  }

  function _parsePusherBlock(text) {
    // Parses the block copied from Pusher dashboard App Keys tab:
    //   app_id = "YOUR_APP_ID"
    //   key = "YOUR_KEY"
    //   secret = "YOUR_SECRET"
    //   cluster = "eu"
    const get = (key) => { const m = text.match(new RegExp(key + '\\s*=\\s*["\']([^"\']+)["\']')); return m ? m[1] : ''; };
    return { appId: get('app_id'), key: get('key'), secret: get('secret'), cluster: get('cluster') };
  }

  function _renderPusher(body) {
    body.innerHTML = `
      <h2>Display Relay</h2>
      <p>The relay server runs on this laptop and streams track info to the dancer screen over your local WiFi. No account needed.</p>
      <ol class="wiz-steps-list">
        <li>The installer already set this up — the relay starts automatically when you launch the app.</li>
        <li>Open the display screen on the dancer TV using the URL shown on the next screen.</li>
        <li>In your Spotify developer dashboard, add <code>http://localhost:3456/</code> as a redirect URI.</li>
      </ol>
      <p class="wiz-hint">Both this laptop and the dancer TV must be on the same WiFi network.</p>
    `;
  }

  function _renderAudD(body) {
    const existingKey = localStorage.getItem('spotd_audd_key') || '';
    body.innerHTML = `
      <h2>Live Recognition <span class="wiz-optional">(optional)</span></h2>
      <p>AudD identifies music from a microphone on the display screen — useful when you’re not using Spotify, or want automatic detection from the room sound.</p>
      <ol class="wiz-steps-list">
        <li>Sign up (free) at <a href="https://dashboard.audd.io" target="_blank" rel="noopener">dashboard.audd.io</a></li>
        <li>Copy your API token</li>
        <li>Paste it below</li>
      </ol>
      <p class="wiz-hint" style="color:#ff9800">Free tier: 300 requests/month ≈ 2.5 hours of a milonga (at 30s intervals).</p>
      <label class="wiz-label">AudD API Token
        <input id="wiz-audd-key" class="wiz-input" type="text" placeholder="test (or your token)" value="${_esc(existingKey)}" autocomplete="off">
      </label>
      <div id="wiz-audd-status" class="wiz-status"></div>
      <button id="wiz-audd-test" class="wiz-btn secondary">Test (record 4s → identify)</button>
    `;

    document.getElementById('wiz-audd-test').addEventListener('click', async () => {
      const keyInput = document.getElementById('wiz-audd-key');
      const statusEl = document.getElementById('wiz-audd-status');
      const key = keyInput.value.trim();
      if (!key) { statusEl.textContent = '\u2717 Enter a token first'; statusEl.className = 'wiz-status error'; return; }
      // Temporarily set key so AudD module can use it
      const prev = localStorage.getItem('spotd_audd_key');
      localStorage.setItem('spotd_audd_key', key);
      statusEl.textContent = 'Recording 4s…'; statusEl.className = 'wiz-status';
      try {
        // Shorten record time for the test via a quick direct fetch
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const chunks = [];
        const mr = new MediaRecorder(stream);
        mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        await new Promise(res => { mr.onstop = res; mr.start(); setTimeout(() => mr.stop(), 4000); });
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType });
        const form = new FormData();
        form.append('api_token', key);
        form.append('audio', blob, 'clip.webm');
        form.append('return', 'spotify');
        statusEl.textContent = 'Identifying…';
        const resp = await (await fetch('https://api.audd.io/', { method: 'POST', body: form })).json();
        if (resp.status === 'success' && resp.result) {
          statusEl.textContent = '\u2713 Identified: ' + resp.result.artist + ' — ' + resp.result.title;
          statusEl.className = 'wiz-status ok';
        } else if (resp.status === 'success') {
          statusEl.textContent = '\u2713 API connected (no match in this clip — that\'s fine)';
          statusEl.className = 'wiz-status ok';
        } else {
          statusEl.textContent = '\u2717 ' + (resp.error && resp.error.error_message || 'API error');
          statusEl.className = 'wiz-status error';
          if (prev) localStorage.setItem('spotd_audd_key', prev); else localStorage.removeItem('spotd_audd_key');
        }
      } catch (e) {
        statusEl.textContent = '\u2717 ' + e.message;
        statusEl.className = 'wiz-status error';
        if (prev) localStorage.setItem('spotd_audd_key', prev); else localStorage.removeItem('spotd_audd_key');
      }
    });
  }

  function _renderLastFm(body) {
    const existingKey = (typeof LastFm !== 'undefined' && LastFm.getKey()) || localStorage.getItem('spotd_lastfm_key') || '';
    body.innerHTML = `
      <h2>Song Stories <span class="wiz-optional">(optional)</span></h2>
      <p>In <strong>Lesson mode</strong>, the right panel shows a short story about each song. Uses Last.fm as the primary source, Wikipedia as fallback.</p>
      <ol class="wiz-steps-list">
        <li>Go to <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">last.fm/api/account/create</a></li>
        <li>Fill in the form — see hints below</li>
        <li>Click <strong>Submit</strong> — you'll get your API key immediately</li>
        <li>Paste it below</li>
      </ol>
      <div class="wiz-hint" style="background:var(--surface2,#1e1e1e);border-radius:6px;padding:10px 14px;margin-bottom:14px;line-height:1.8">
        <strong>What to fill in on Last.fm:</strong><br>
        <span style="color:var(--text-muted,#888)">Application name:</span> TangoPassion Display<br>
        <span style="color:var(--text-muted,#888)">Application description:</span> Displays track info at tango milongas<br>
        <span style="color:var(--text-muted,#888)">Callback URL:</span> <em>leave blank</em><br>
        <span style="color:var(--text-muted,#888)">Application homepage:</span> <em>leave blank</em>
      </div>
      <p class="wiz-hint">Wikipedia fallback works without a key for well-known songs.</p>
      <label class="wiz-label">Last.fm API Key
        <input id="wiz-lastfm-key" class="wiz-input" type="text" placeholder="e.g. a1b2c3d4e5f6..." value="${_esc(existingKey)}" autocomplete="off">
      </label>
      <div id="wiz-lastfm-status" class="wiz-status"></div>
      <button id="wiz-lastfm-test" class="wiz-btn secondary">Test (La Cumparsita by Rodríguez)</button>
    `;

    document.getElementById('wiz-lastfm-test').addEventListener('click', async () => {
      const input   = document.getElementById('wiz-lastfm-key');
      const statusEl = document.getElementById('wiz-lastfm-status');
      const key = input.value.trim();
      statusEl.textContent = 'Looking up…'; statusEl.className = 'wiz-status';
      try {
        const params = new URLSearchParams({
          method: 'track.getInfo', api_key: key || 'nomatch',
          artist: 'La Orquesta de Rodríguez', track: 'La Cumparsita',
          format: 'json', autocorrect: '1',
        });
        const r = await fetch('https://ws.audioscrobbler.com/2.0/?' + params);
        const d = await r.json();
        if (d.error && (d.error === 4 || d.error === 10 || d.error === 26)) {
          // Auth errors: 4=Invalid auth, 10=Invalid API key, 26=Suspended
          statusEl.textContent = '✗ Invalid API key — double-check it above';
          statusEl.className = 'wiz-status error';
        } else if (d.error) {
          // Any other error (e.g. track not found) means key is fine
          statusEl.textContent = '✓ Last.fm connected — stories ready';
          statusEl.className = 'wiz-status ok';
        } else if (d.track && d.track.wiki && d.track.wiki.summary) {
          statusEl.textContent = '✓ Last.fm connected — stories ready';
          statusEl.className = 'wiz-status ok';
        } else {
          statusEl.textContent = '✓ Last.fm connected (no wiki for this track — Wikipedia will cover it)';
          statusEl.className = 'wiz-status ok';
        }
      } catch (e) {
        statusEl.textContent = '✗ ' + e.message;
        statusEl.className = 'wiz-status error';
      }
    });
  }

  function _saveLastFmStep() {
    const el = document.getElementById('wiz-lastfm-key');
    if (!el) return;
    const val = el.value.trim();
    if (val) localStorage.setItem('spotd_lastfm_key', val);
    else     localStorage.removeItem('spotd_lastfm_key');
    if (typeof LastFm !== 'undefined') LastFm.setKey(val);
  }

  function _renderAI(body) {
    const existingKey = localStorage.getItem('spotd_openrouter_key') || '';
    body.innerHTML = `
      <h2>AI Story Generator <span class="wiz-optional">(optional)</span></h2>
      <p>Powers the <strong>✨ Generate</strong> button in the DJ control panel — writes a short backstory for the current song using AI.</p>
      <ol class="wiz-steps-list">
        <li>Sign up (free) at <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a></li>
        <li>Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> and create a key</li>
        <li>Paste it below</li>
      </ol>
      <p class="wiz-hint">Free models available — no credit card required for basic use.</p>
      <label class="wiz-label">OpenRouter API Key
        <input id="wiz-openrouter-key" class="wiz-input" type="text" placeholder="sk-or-v1-..." value="${_esc(existingKey)}" autocomplete="off">
      </label>
      <div id="wiz-openrouter-status" class="wiz-status"></div>
      <button id="wiz-openrouter-test" class="wiz-btn secondary">Test</button>
    `;

    document.getElementById('wiz-openrouter-test').addEventListener('click', async () => {
      const input   = document.getElementById('wiz-openrouter-key');
      const statusEl = document.getElementById('wiz-openrouter-status');
      const key = input.value.trim();
      if (!key) { statusEl.textContent = '\u2717 Enter a key first'; statusEl.className = 'wiz-status error'; return; }
      statusEl.textContent = 'Testing\u2026'; statusEl.className = 'wiz-status';
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://guymayer.github.io/SpotyTangoDisplay/',
          },
          body: JSON.stringify({
            models: [
            'openai/gpt-oss-20b:free',
            'openai/gpt-oss-120b:free',
            'meta-llama/llama-3.3-70b-instruct:free',
          ],
            route: 'fallback',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          const msg = (data.error && data.error.message) || ('HTTP ' + resp.status);
          statusEl.textContent = '\u2717 ' + msg;
          statusEl.className = 'wiz-status error';
        } else {
          statusEl.textContent = '\u2713 OpenRouter connected \u2014 AI stories ready';
          statusEl.className = 'wiz-status ok';
        }
      } catch (e) {
        statusEl.textContent = '\u2717 ' + e.message;
        statusEl.className = 'wiz-status error';
      }
    });
  }

  function _saveAIStep() {
    const el = document.getElementById('wiz-openrouter-key');
    if (!el) return;
    const val = el.value.trim();
    if (val) localStorage.setItem('spotd_openrouter_key', val);
    else     localStorage.removeItem('spotd_openrouter_key');
  }

  function _renderBranding(body) {
    const profile = Profiles.getActive();
    const b = profile.branding || {};

    body.innerHTML = `
      <h2>Your Branding</h2>
      <label class="wiz-label">DJ Name
        <input id="wiz-dj-name" class="wiz-input" type="text" placeholder="TangoPassion" value="${_esc(b.djName||'')}">
      </label>
      <label class="wiz-label">Accent Colour
        <input id="wiz-accent-color" class="wiz-input" type="color" value="${_esc(profile.accentColor||'#c8a96e')}">
      </label>
      <label class="wiz-label">Logo (optional)
        <input id="wiz-logo-upload" class="wiz-input" type="file" accept="image/*">
      </label>
      <div id="wiz-logo-preview" class="wiz-logo-preview"></div>
    `;

    // Show existing logo preview
    if (b.logoData) {
      document.getElementById('wiz-logo-preview').innerHTML =
        `<img src="${b.logoData}" style="max-width:120px;max-height:80px;border-radius:4px;">`;
    }

    document.getElementById('wiz-logo-upload').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById('wiz-logo-preview').innerHTML =
          `<img src="${ev.target.result}" style="max-width:120px;max-height:80px;border-radius:4px;">`;
      };
      reader.readAsDataURL(file);
    });
  }

  function _renderCortina(body) {
    const genres = Cortina.getDanceGenres().map(g => g.genre || g).join('\n');
    const playlistUrl = Cortina.getCortinaPlaylistId()
      ? 'https://open.spotify.com/playlist/' + Cortina.getCortinaPlaylistId()
      : '';

    body.innerHTML = `
      <h2>Cortina Rules <span class="wiz-optional">(optional)</span></h2>
      <p>A <strong>cortina</strong> is a short non-dance track played between tandas. TangoPassion detects them automatically by genre.</p>
      <label class="wiz-label">Dance genres (one per line — anything not listed is a cortina)
        <textarea id="wiz-dance-genres" class="wiz-textarea" rows="6">${_esc(genres)}</textarea>
      </label>
      <label class="wiz-label">Cortina Playlist (optional)
        <input id="wiz-cortina-playlist" class="wiz-input" type="url"
          placeholder="https://open.spotify.com/playlist/..."
          value="${_esc(playlistUrl)}">
        <span class="wiz-hint">Tracks in this playlist are always treated as cortinas, regardless of genre.</span>
      </label>
    `;
  }

  function _renderDesign(body) {
    const profile = Profiles.getActive();
    const bg  = profile.background       || {};
    const lb  = profile.lessonBackground || profile.background || {};
    const lp  = profile.lessonPanels     || { showOrchestra: true, showStory: true };
    const all = Profiles.list();

    body.innerHTML = `
      <h2>Display Design <span class="wiz-optional">(optional)</span></h2>

      <div class="wiz-design-profile-row">
        <label class="wiz-label" style="flex:1;margin:0">
          Appearance Profile
          <select id="wiz-profile-select">
            ${all.map(p => `<option value="${_esc(p.id)}"${p.id === profile.id ? ' selected' : ''}>${_esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <div class="wiz-profile-btns">
          <button id="wiz-profile-new" class="wiz-btn ghost small">+ New</button>
          <button id="wiz-profile-dup" class="wiz-btn ghost small">Dup</button>
          <button id="wiz-profile-del" class="wiz-btn ghost small" style="color:var(--red,#e06c75)">Del</button>
        </div>
      </div>

      <div class="wiz-tabs">
        <button class="wiz-tab active" data-tab="milonga">Milonga</button>
        <button class="wiz-tab" data-tab="lesson">Lesson</button>
      </div>

      <div id="wiz-tab-milonga" class="wiz-tab-panel">
        <label class="wiz-label">Background Colour
          <input id="wiz-milonga-bg-color" class="wiz-input" type="color" value="${_esc(bg.color || '#1a0a2e')}" style="height:40px;padding:4px 6px">
        </label>
        <label class="wiz-label">Background Image <span class="wiz-optional">(replaces colour)</span>
          <input id="wiz-milonga-bg-image" class="wiz-input" type="file" accept="image/*">
        </label>
        <div id="wiz-milonga-bg-preview" class="wiz-bg-preview">
          ${bg.imageData ? `<img src="${bg.imageData}" style="max-width:100%;max-height:100px;border-radius:4px;display:block">
          <button id="wiz-milonga-bg-clear" class="wiz-btn ghost small" style="margin-top:6px">✕ Clear image</button>` : ''}
        </div>
      </div>

      <div id="wiz-tab-lesson" class="wiz-tab-panel" style="display:none">
        <div class="wiz-toggle-row">
          <label class="wiz-toggle-label">
            <input type="checkbox" id="wiz-lesson-show-orchestra"${lp.showOrchestra !== false ? ' checked' : ''}>
            Show Orchestra panel (left)
          </label>
        </div>
        <div class="wiz-toggle-row">
          <label class="wiz-toggle-label">
            <input type="checkbox" id="wiz-lesson-show-story"${lp.showStory !== false ? ' checked' : ''}>
            Show Story panel (right)
          </label>
        </div>
        <label class="wiz-label" style="margin-top:12px">Background Colour
          <input id="wiz-lesson-bg-color" class="wiz-input" type="color" value="${_esc(lb.color || '#1a0a2e')}" style="height:40px;padding:4px 6px">
        </label>
        <label class="wiz-label">Background Image <span class="wiz-optional">(replaces colour)</span>
          <input id="wiz-lesson-bg-image" class="wiz-input" type="file" accept="image/*">
        </label>
        <div id="wiz-lesson-bg-preview" class="wiz-bg-preview">
          ${lb.imageData ? `<img src="${lb.imageData}" style="max-width:100%;max-height:100px;border-radius:4px;display:block">
          <button id="wiz-lesson-bg-clear" class="wiz-btn ghost small" style="margin-top:6px">✕ Clear image</button>` : ''}
        </div>
      </div>
    `;

    // ── Tab switching ─────────────────────────────────────────────────────
    body.querySelectorAll('.wiz-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.wiz-tab').forEach(b => b.classList.remove('active'));
        body.querySelectorAll('.wiz-tab-panel').forEach(p => { p.style.display = 'none'; });
        btn.classList.add('active');
        const panel = document.getElementById('wiz-tab-' + btn.dataset.tab);
        if (panel) panel.style.display = '';
      });
    });

    // ── Profile CRUD ──────────────────────────────────────────────────────
    document.getElementById('wiz-profile-select').addEventListener('change', e => {
      Profiles.setActive(e.target.value);
      _renderDesign(body);
    });
    document.getElementById('wiz-profile-new').addEventListener('click', () => {
      const name = prompt('Profile name:');
      if (!name) return;
      const p = Profiles.create(name);
      Profiles.setActive(p.id);
      _renderDesign(body);
    });
    document.getElementById('wiz-profile-dup').addEventListener('click', () => {
      const p = Profiles.getActive();
      const dup = Profiles.duplicate(p.id);
      if (dup) { Profiles.setActive(dup.id); _renderDesign(body); }
    });
    document.getElementById('wiz-profile-del').addEventListener('click', () => {
      const p = Profiles.getActive();
      if (p.id === 'default') { alert('Cannot delete the default profile.'); return; }
      if (!confirm('Delete profile "' + p.name + '"?')) return;
      Profiles.remove(p.id);
      _renderDesign(body);
    });

    // ── Image upload helpers ──────────────────────────────────────────────
    function _bindImageUpload(inputId, previewId, clearId, profileKey) {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          const preview = document.getElementById(previewId);
          preview.innerHTML = `<img src="${ev.target.result}" style="max-width:100%;max-height:100px;border-radius:4px;display:block">
            <button class="wiz-btn ghost small" style="margin-top:6px" id="${clearId}">✕ Clear image</button>`;
          document.getElementById(clearId).addEventListener('click', () => {
            input.value = '';
            preview.innerHTML = '';
            const cur = Profiles.getActive();
            const existing = cur[profileKey] || {};
            Profiles.update(cur.id, { [profileKey]: Object.assign({}, existing, { type: 'color', imageData: null }) });
          });
        };
        reader.readAsDataURL(file);
      });
      const clearBtn = document.getElementById(clearId);
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          document.getElementById(previewId).innerHTML = '';
          const cur = Profiles.getActive();
          const existing = cur[profileKey] || {};
          Profiles.update(cur.id, { [profileKey]: Object.assign({}, existing, { type: 'color', imageData: null }) });
        });
      }
    }

    _bindImageUpload('wiz-milonga-bg-image', 'wiz-milonga-bg-preview', 'wiz-milonga-bg-clear', 'background');
    _bindImageUpload('wiz-lesson-bg-image',  'wiz-lesson-bg-preview',  'wiz-lesson-bg-clear',  'lessonBackground');
  }

  function _saveDesignStep() {
    const profile = Profiles.getActive();
    const changes = {};

    // Milonga background colour
    const mbgColor = document.getElementById('wiz-milonga-bg-color');
    if (mbgColor) {
      const existing = profile.background || {};
      const hasNewImg = !!(document.getElementById('wiz-milonga-bg-image') || {}).files && document.getElementById('wiz-milonga-bg-image').files[0];
      changes.background = Object.assign({}, existing, {
        color: mbgColor.value,
        type:  hasNewImg ? 'image' : (existing.imageData ? 'image' : 'color'),
      });
    }

    // Lesson panel toggles
    const showOrch  = document.getElementById('wiz-lesson-show-orchestra');
    const showStory = document.getElementById('wiz-lesson-show-story');
    changes.lessonPanels = {
      showOrchestra: showOrch  ? showOrch.checked  : true,
      showStory:     showStory ? showStory.checked : true,
    };

    // Lesson background colour
    const lbgColor = document.getElementById('wiz-lesson-bg-color');
    if (lbgColor) {
      const existing = profile.lessonBackground || profile.background || {};
      const hasNewImg = !!(document.getElementById('wiz-lesson-bg-image') || {}).files && document.getElementById('wiz-lesson-bg-image').files[0];
      changes.lessonBackground = Object.assign({}, existing, {
        color: lbgColor.value,
        type:  hasNewImg ? 'image' : (existing.imageData ? 'image' : 'color'),
      });
    }

    Profiles.update(profile.id, changes);

    // Milonga background image upload
    const milongaImg = document.getElementById('wiz-milonga-bg-image');
    if (milongaImg && milongaImg.files[0]) {
      const reader = new FileReader();
      reader.onload = ev => {
        const p = Profiles.getActive();
        Profiles.update(p.id, { background: Object.assign({}, p.background, { type: 'image', imageData: ev.target.result }) });
      };
      reader.readAsDataURL(milongaImg.files[0]);
    }

    // Lesson background image upload
    const lessonImg = document.getElementById('wiz-lesson-bg-image');
    if (lessonImg && lessonImg.files[0]) {
      const reader = new FileReader();
      reader.onload = ev => {
        const p = Profiles.getActive();
        Profiles.update(p.id, { lessonBackground: Object.assign({}, p.lessonBackground || {}, { type: 'image', imageData: ev.target.result }) });
      };
      reader.readAsDataURL(lessonImg.files[0]);
    }
  }

  function _renderDone(body) {
    const displayUrl = PusherRelay.getDisplayUrl();

    body.innerHTML = `
      <div class="wiz-center">
        <div class="wiz-hero-icon">🎉</div>
        <h2>You're all set!</h2>
        <p>Open the dancer screen on any TV or monitor on the same WiFi.</p>
        <p class="wiz-hint" style="color:#ff9800">The relay starts automatically with the app — no extra steps needed.</p>
        <div class="wiz-url-block">
          <span class="wiz-url">${_esc(displayUrl)}</span>
          <button id="wiz-copy-url" class="wiz-btn ghost small">Copy</button>
        </div>
        <a href="${_esc(displayUrl)}" target="_blank" rel="noopener" class="wiz-btn secondary">
          Open Display Screen ↗
        </a>
      </div>
    `;

    document.getElementById('wiz-copy-url').addEventListener('click', () => {
      navigator.clipboard.writeText(displayUrl).then(() => {
        document.getElementById('wiz-copy-url').textContent = 'Copied!';
      });
    });
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function _validateStep(step) {
    switch (step) {
      case 2: return _validateSpotify();
      case 3: return _validatePusher();
      default: return true;
    }
  }

  function _validateSpotify() {
    const id = document.getElementById('wiz-spotify-client-id');
    if (!id) return true;
    const val = id.value.trim();
    if (!val) { _showError('wiz-spotify-status', 'Client ID is required'); return false; }
    return true;
  }

  function _validatePusher() {
    return true;
  }

  function _showError(statusId, msg) {
    const el = document.getElementById(statusId);
    if (!el) return;
    el.textContent = '✗ ' + msg;
    el.className = 'wiz-status error';
  }

  // ── Step data saving ──────────────────────────────────────────────────────

  function _saveStepData(step) {
    switch (step) {
      case 2: _saveSpotifyStep();   break;
      case 3: _savePusherStep();    break;
      case 4: _saveAudDStep();      break;
      case 5: _saveLastFmStep();    break;
      case 6: _saveAIStep();        break;
      case 7: _saveBrandingStep();  break;
      case 8: _saveCortinaStep();   break;
      case 9: _saveDesignStep();    break;
    }
  }

  function _saveAudDStep() {
    const el = document.getElementById('wiz-audd-key');
    if (!el) return;
    const val = el.value.trim();
    if (val) localStorage.setItem('spotd_audd_key', val);
    else     localStorage.removeItem('spotd_audd_key');
  }

  function _saveSpotifyStep() {
    const id = (document.getElementById('wiz-spotify-client-id') || {}).value || '';
    if (id.trim()) {
      localStorage.setItem('spotd_spotify_client_id', id.trim());
      CONFIG.spotify.clientId = id.trim();
    }
  }

  function _savePusherStep() {
    PusherRelay.saveLocalHost(window.location.host);
  }

  function _saveBrandingStep() {
    const nameEl  = document.getElementById('wiz-dj-name');
    const colorEl = document.getElementById('wiz-accent-color');
    const logoEl  = document.getElementById('wiz-logo-upload');

    const changes = { branding: {} };
    if (nameEl)  changes.branding.djName   = nameEl.value.trim();
    if (colorEl) changes.accentColor       = colorEl.value;

    const profile = Profiles.getActive();
    Profiles.update(profile.id, changes);

    // Logo handled via FileReader — read preview src
    if (logoEl && logoEl.files[0]) {
      const reader = new FileReader();
      reader.onload = ev => Profiles.setLogo(profile.id, ev.target.result);
      reader.readAsDataURL(logoEl.files[0]);
    }
  }

  function _saveCortinaStep() {
    const genresEl = document.getElementById('wiz-dance-genres');
    const playlistEl = document.getElementById('wiz-cortina-playlist');

    if (genresEl) {
      const lines = genresEl.value.split('\n').map(s => s.trim()).filter(Boolean);
      Cortina.setDanceGenres(lines);
    }
    if (playlistEl && playlistEl.value.trim()) {
      Cortina.setCortinaPlaylistUrl(playlistEl.value.trim());
    }
  }

  // ── Util ──────────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { isComplete, runIfNeeded, show };
})();
