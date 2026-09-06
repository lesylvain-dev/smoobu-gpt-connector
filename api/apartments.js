import { assertConnectorAuth, sendError, smoobuRequest } from './_lib/smoobu.js';

export default async function handler(req, res) {
  try {
    assertConnectorAuth(req);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const data = await smoobuRequest('/api/apartments');
    res.status(200).json(data);
  } catch (error) {
    sendError(res, error);
  }
}
