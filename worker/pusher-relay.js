/**
 * Cloudflare Worker — Pusher CORS Relay
 *
 * Pusher's server REST API has no CORS headers, so browsers can't call it directly.
 * This worker proxies POST requests to Pusher and adds CORS headers.
 *
 * Deploy steps:
 *   1. Go to https://dash.cloudflare.com/ → Workers & Pages → Create Worker
 *   2. Paste this file's contents into the editor, click Deploy
 *   3. Copy the worker URL (e.g. https://pusher-relay.YOUR-NAME.workers.dev)
 *   4. In SpotyTangoDisplay wizard step 3, paste that URL into "Relay URL"
 *
 * Free tier: 100,000 requests/day — more than enough for a DJ set.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }

    const incoming = new URL(req.url);

    // _cluster is added by pusher.js to tell us which Pusher cluster to hit.
    // Strip it before forwarding to Pusher.
    const cluster = incoming.searchParams.get('_cluster') || 'eu';
    incoming.searchParams.delete('_cluster');

    const pusherUrl =
      'https://api-' + cluster + '.pusher.com' +
      incoming.pathname + '?' + incoming.searchParams.toString();

    const body = await req.text();

    try {
      const res = await fetch(pusherUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  },
};
