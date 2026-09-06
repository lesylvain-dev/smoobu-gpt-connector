import { assertConnectorAuth, sendError, smoobuRequest } from './_lib/smoobu.js';

export default async function handler(req, res) {
  try {
    assertConnectorAuth(req);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { start_date, end_date } = req.query;
    let apartments = req.query['apartments[]'] ?? req.query.apartments;
    if (!start_date || !end_date || !apartments) {
      return res.status(400).json({ error: 'start_date, end_date and apartments are required' });
    }
    if (!Array.isArray(apartments)) apartments = String(apartments).split(',').map(v => v.trim()).filter(Boolean);

    const data = await smoobuRequest('/api/rates', {
      query: { start_date, end_date, 'apartments[]': apartments },
    });
    res.status(200).json(data);
  } catch (error) {
    sendError(res, error);
  }
}
