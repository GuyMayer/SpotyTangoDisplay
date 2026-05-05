// local-relay.js — Local network relay helper
// Cloud/Pusher support removed. Always uses the local relay.js server.

const PusherRelay = (() => {
  const LOCAL_HOST_KEY = 'spotd_local_host';

  function getRelayMode() { return 'local'; }
  function setRelayMode() {}  // noop — always local

  function getLocalHost() {
    return localStorage.getItem(LOCAL_HOST_KEY) || window.location.host;
  }

  function saveLocalHost(host) {
    localStorage.setItem(LOCAL_HOST_KEY, host);
  }

  function hasCredentials() { return true; }

  function getDisplayUrl() {
    const base = window.location.origin +
      window.location.pathname.replace(/[^/]*$/, '');
    return base + 'display.html?host=' + encodeURIComponent(getLocalHost());
  }

  async function send(payload) {
    const host = getLocalHost();
    try {
      const res = await fetch(window.location.protocol + '//' + host + '/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (err) {
      console.error('[LocalRelay] send error:', err);
      return false;
    }
  }

  return { send, getRelayMode, setRelayMode, hasCredentials, getDisplayUrl, getLocalHost, saveLocalHost };
})();
