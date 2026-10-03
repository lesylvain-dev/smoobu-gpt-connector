import { protectedResourceMetadata } from './_lib/oauth.js';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try { return res.status(200).json(protectedResourceMetadata()); }
  catch { return res.status(503).json({ error: 'OAuth setup pending', required: ['AUTHKIT_DOMAIN', 'MCP_ALLOWED_USER_ID'] }); }
}
