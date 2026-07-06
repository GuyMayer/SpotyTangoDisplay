# Changelog

All notable changes to SpotyTangoDisplay are documented here.

## [1.3.0] — 2026-07-06

### Added

- **Milonga sequence position display.** Shows dancers where they are in the tanda rotation: a visual strip of pills (T T M T T V) with the current tanda highlighted in gold. Past tandas fade, future tandas dim. Reuses the existing rotation pattern setting. Updates live as tandas complete.
- **Auto-advance on cortina.** When a cortina starts, automatically skip to the next track after a configurable delay (default 60s). Persists in localStorage. Track-ID guard prevents stale skips if the DJ manually skips mid-cortina. Timer restarts when delay setting changes.
- **Living master DB.** Display downloads the latest tango DB from GitHub once per day (version-checked). Local additions (DJ-added tracks with type/year/singer) merge on top. New "Track Database" card in the control panel for adding tracks and contributing back to the master.
- **Singer data in tango-db.json.** 10,078 of 20,259 entries (49.7%) now ship with singer data — 5,565 precise per-track matches from el-recodo.csv + 4,513 orchestra-level data from orchestras.json. Display and control panel now show singer where available.
- **POST /contribute endpoint.** Relay accepts local additions from the control panel, merges into `data/local-additions.json` for master DB inclusion. 64KB body limit, never overwrites existing entries.
- **Venue hardware kit.** Captive portal HTML, QR code generator script (`tools/make-qr.py` — generates WiFi + direct URL QRs), TangoPassion logo SVG placeholder.
- **Smoke test suite.** 11 end-to-end tests for relay.js (ping, HTML serving, SSE, push/broadcast, last-state replay, 404, path traversal 403, CORS, /contribute). Runs in CI on every push via `.github/workflows/test.yml`.
- **Offline-first singer enrichment script.** `tools/enrich-tango-db.py` with `--no-csv` mode (orchestras.json fallback, 45% coverage offline), `--local` flag for merging local additions, auto-bumps `tango-db-version.txt`.

### Changed

- **Custom domain.** `CNAME` file added for `display.tangopassion.co.uk`. DNS record + GitHub domain verification required separately. Existing `guymayer.github.io/SpotyTangoDisplay/` URL continues to work.
- **HTTP-Referer dynamic.** All OpenRouter API calls (orchestra bios, title translation, song stories) now use `window.location.origin` instead of a hardcoded GitHub Pages URL. Works correctly on custom domain without code changes.
- **Spotify OAuth scope.** Added `user-modify-playback-state` (required for auto-advance skip feature). Existing users must re-authorize to grant the new scope.

### Fixed

- **Tray update-checker URL** now points to `display.tangopassion.co.uk/download.html` instead of the old GitHub Pages URL.

---

## [1.2.0] — 2026-05-05

### Added

- **Autosave settings on wizard completion.** When the wizard finishes, `TangoPassion_Settings.skp` is automatically downloaded so the setup is immediately portable.
- **Load Settings button in wizard** (step 2 — Spotify). Allows importing a previously saved `.skp` or `.json` settings file at the start of setup, skipping manual re-entry of all credentials.
- **Settings export from control panel** now saves as `.skp` (SKPE1-encoded) instead of plain JSON, matching the wizard format. Includes profiles, branding, and logo.
- **Settings import in control panel** now accepts both `.json` and `.skp` files.
- **SKPE1 encoding** — settings files are `SKPE1|<base64>` — credentials are not stored in plain text in exported files.

### Fixed

- **Display screen black on first run.** `_renderIdle()` crashed with `Cannot read properties of null` when no appearance profile was configured, leaving the display entirely black. Now shows a basic "Welcome" idle screen when no profile exists.
- **Debug Info shows "operation timed out"** — `WebClient` was connecting to `::1` (IPv6) because Windows resolves `localhost` to IPv6 first, but relay only binds IPv4 (`0.0.0.0`). Fixed by using `127.0.0.1` explicitly in all WebClient ping calls.
- **Legacy `.skp` files rejected on import** — file picker now accepts `.skp` in addition to `.json`; legacy `spotm_` key prefix auto-remapped to `spotd_`.

---

## [1.1.0] — 2026-05-05

### Changed

- **Relay is now local-only.** Pusher / cloud relay support removed. The Windows tray app (`relay.js`) handles all communication between the DJ laptop and the dancer display over local WiFi. No third-party accounts needed.
- Wizard step 3 simplified — no more Pusher credential entry.
- Room code removed from the UI (not needed for local relay).
- Status pill renamed from "Pusher" to "Relay".
- `worker/pusher-relay.js` (Cloudflare Worker) deleted — no longer relevant.

### Fixed

- **relay.js crash on startup** — duplicate `const clients` declaration (SyntaxError) removed.
- **Tray menu frozen / spinner** — startup HTTP poll moved off the UI thread so the menu stays responsive while relay is starting.
- **Debug Info did nothing** — moved to inline execution (background job had a variable scope issue).
- **Old EXE downloaded on every update** — GitHub Actions now uses a unique release tag per build (`build-N`) so the browser always fetches a fresh file.
- **Exit menu didn't kill relay** — Exit now kills `node.exe` by process name in addition to the `cmd.exe` wrapper PID.
- **Relay orphaned on relaunch** — startup now kills any existing relay by port 3456 and by process name before starting a new one.
- **Menu spinner on Debug Info** — previously ran a `Start-Job` with broken closure; now runs inline.
- **WMI boot hang** — replaced `Get-WmiObject` with `Get-CimInstance` throughout.
- **Buffer deadlock** — relay launched via `cmd.exe /c ... > logfile` instead of PowerShell `RedirectStandardOutput`.
- **Bat window stays open** — PowerShell tray detached correctly so `start-windows.bat` window closes immediately.
- **`-NoProfile`** added to PowerShell launch for faster startup.

---

## [1.0.0] — 2026-05-03

Initial release.

- Spotify PKCE OAuth — no client secret, runs entirely in browser.
- Milonga mode: tanda position, cortina detection (genre denylist + playlist override), "Coming Up" preview.
- Lesson mode: simple track display, no tanda/cortina logic.
- Live mode: AudD microphone recognition as track source.
- Appearance profiles: fonts, colors, backgrounds, logos, field order — all per-profile.
- First-time setup wizard (10 steps).
- Windows tray app: `relay.js` (Node.js HTTP + SSE server) + `relay-tray.ps1` (system tray, singleton, auto-opens browser).
- GitHub Actions installer build via NSIS → EXE on every push to `main`.
- LastFM song stories and OpenRouter AI-generated orchestra bios.
