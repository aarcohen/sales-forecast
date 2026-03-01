const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

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
    const opts = {
      method: req.method,
      headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' }
    };
    if (req.method === 'POST' && req.body) opts.body = JSON.stringify(req.body);

    const r = await fetch(hubspotUrl, opts);
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(502).json({ error: 'Internal server error', message: err.message });
  }
};
