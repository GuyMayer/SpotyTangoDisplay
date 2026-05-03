// wizard.js — First-time setup wizard (6 steps)
// Runs on first visit; skips if already configured. Re-runnable from Settings.

const Wizard = (() => {
  const STORAGE_DONE = 'spotd_wizard_done';   // 'true' when completed
  const STORAGE_STEP = 'spotd_wizard_step';   // resume step if closed mid-way

  let _currentStep = 1;
  const TOTAL_STEPS = 9;

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
    9: { id: 'done',      title: 'Done!'            },
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
      skipBtn.classList.toggle('hidden', ![4, 5, 6, 8].includes(_currentStep));
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
      case 9: _renderDone(body);      break;
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
      <button id="wiz-spotify-connect" class="wiz-btn primary" ${loggedIn ? 'disabled' : ''}>
        ${loggedIn ? 'Connected' : 'Authorise Spotify'}
      </button>
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
    const creds = PusherRelay.getCredentials();

    body.innerHTML = `
      <h2>Display Relay (Pusher)</h2>
      <p>Pusher is the free real-time bridge between your DJ app and the dancer screen. Each DJ uses their own free account.</p>
      <ol class="wiz-steps-list">
        <li>Sign up (free) at <a href="https://pusher.com" target="_blank" rel="noopener">pusher.com</a></li>
        <li>Create a new <strong>Channels</strong> app</li>
        <li>Go to <strong>App Keys</strong>, click <strong>Copy</strong>, then paste below</li>
      </ol>
      <label class="wiz-label">Paste App Keys block
        <textarea id="wiz-pusher-paste" class="wiz-input" rows="4" placeholder='app_id = "12345"&#10;key = "abc..."&#10;secret = "xyz..."&#10;cluster = "eu"' style="font-family:monospace;font-size:12px;resize:vertical"></textarea>
      </label>
      <p class="wiz-hint" style="text-align:center;margin:4px 0 12px;color:var(--text-muted,#888);font-size:13px">— or enter values manually —</p>
      <label class="wiz-label">App ID
        <input id="wiz-pusher-app-id" class="wiz-input" type="text" placeholder="12345" value="${_esc(creds.appId||'')}">
      </label>
      <label class="wiz-label">Key
        <input id="wiz-pusher-key" class="wiz-input" type="text" placeholder="abc123..." value="${_esc(creds.key||'')}">
      </label>
      <label class="wiz-label">Secret
        <input id="wiz-pusher-secret" class="wiz-input" type="password" placeholder="••••••••" value="${_esc(creds.secret||'')}">
      </label>
      <label class="wiz-label">Cluster
        <input id="wiz-pusher-cluster" class="wiz-input" type="text" placeholder="eu  (or us2, ap1, etc.)" value="${_esc(creds.cluster||'')}">
      </label>
      <div id="wiz-pusher-status" class="wiz-status"></div>
      <button id="wiz-pusher-test" class="wiz-btn secondary">Test Connection</button>
    `;

    document.getElementById('wiz-pusher-paste').addEventListener('input', (e) => {
      const parsed = _parsePusherBlock(e.target.value);
      if (parsed.appId) document.getElementById('wiz-pusher-app-id').value = parsed.appId;
      if (parsed.key)   document.getElementById('wiz-pusher-key').value   = parsed.key;
      if (parsed.secret) document.getElementById('wiz-pusher-secret').value = parsed.secret;
      if (parsed.cluster) document.getElementById('wiz-pusher-cluster').value = parsed.cluster;
    });

    document.getElementById('wiz-pusher-test').addEventListener('click', async () => {
      const creds = _readPusherFields();
      if (!creds) return;
      const statusEl = document.getElementById('wiz-pusher-status');
      statusEl.textContent = 'Testing…';
      statusEl.className = 'wiz-status';
      try {
        const ok = await PusherRelay.test(creds);
        if (ok) {
          statusEl.textContent = '✓ Credentials valid';
          statusEl.className = 'wiz-status ok';
        } else {
          statusEl.textContent = '✗ Invalid credentials — double-check the values above';
          statusEl.className = 'wiz-status error';
        }
      } catch (e) {
        statusEl.textContent = '✗ ' + e.message;
        statusEl.className = 'wiz-status error';
      }
    });
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

  function _renderDone(body) {
    const roomCode = PusherRelay.getRoomCode();
    const displayUrl = PusherRelay.getDisplayUrl();

    body.innerHTML = `
      <div class="wiz-center">
        <div class="wiz-hero-icon">🎉</div>
        <h2>You're all set!</h2>
        <p>Open the dancer screen on any TV or monitor connected to the same room code.</p>
        <div class="wiz-room-block">
          <div class="wiz-room-label">Room Code</div>
          <div class="wiz-room-code">${_esc(roomCode)}</div>
        </div>
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
    const creds = _readPusherFields();
    return creds !== null;
  }

  function _readPusherFields() {
    const get = id => (document.getElementById(id) || {}).value || '';
    const creds = {
      appId:   get('wiz-pusher-app-id').trim(),
      key:     get('wiz-pusher-key').trim(),
      secret:  get('wiz-pusher-secret').trim(),
      cluster: get('wiz-pusher-cluster').trim(),
    };
    if (!creds.appId || !creds.key || !creds.secret || !creds.cluster) {
      _showError('wiz-pusher-status', 'All four Pusher fields are required');
      return null;
    }
    return creds;
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
    const creds = _readPusherFields();
    if (creds) PusherRelay.saveCredentials(creds);
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
