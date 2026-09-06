import { assertConnectorAuth, sendError, smoobuRequest } from './_lib/smoobu.js';

export default async function handler(req, res) {
  try {
    assertConnectorAuth(req);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { from, to, created_from, created_to, modifiedFrom, apartmentId, page, pageSize } = req.query;
    const data = await smoobuRequest('/api/reservations', {
      query: { from, to, created_from, created_to, modifiedFrom, apartmentId, page, pageSize },
    });
    res.status(200).json(data);
  } catch (error) {
    sendError(res, error);
  }
}
