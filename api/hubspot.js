const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// Module-level response cache — persists within a warm Vercel Lambda instance.
// Prevents re-hitting HubSpot when Mission Control pre-loads then the user opens.
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const ALLOWED_ORIGINS = [
  process.env.MISSION_CONTROL_ORIGIN || '',
  process.env.DASHBOARD_ORIGIN || '',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean).map(s => s.trim());

function setCors(res, origin) {
  const allowed = !origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || ALLOWED_ORIGINS.length === 0;
  const o = allowed ? (origin || '*') : null;
  if (!o) return false;
  res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return true;
}

module.exports = async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (!setCors(res, origin)) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return res.status(204).end();

    const hubspotPath = req.url.replace(/^\/api/, '');
    if (!hubspotPath || hubspotPath === '/hubspot') return res.status(400).json({ error: 'Missing API path' });

    const hubspotUrl = `https://api.hubapi.com${hubspotPath}`;
    const body = req.method === 'POST' && req.body ? JSON.stringify(req.body) : undefined;

    // Check cache first — avoids repeat HubSpot calls on double-loads
    const cacheKey = `${req.method}:${hubspotUrl}:${body || ''}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached.data);
    }

    const opts = {
      method: req.method,
      headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' }
    };
    if (body) opts.body = body;

    // Simple passthrough — no proxy-side retry (avoids Vercel function timeouts).
    // The client handles 429 retry with exponential backoff.
    const r = await fetch(hubspotUrl, opts);
    const data = await r.json();

    if (r.status === 200) {
      cache.set(cacheKey, { data, ts: Date.now() });
    }

    return res.status(r.status).json(data);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(502).json({ error: 'Internal server error', message: err.message });
  }
};
