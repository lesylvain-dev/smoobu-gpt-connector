import { assertConnectorAuth, sendError, smoobuRequest } from './_lib/smoobu.js';

export default async function handler(req, res) {
  try {
    assertConnectorAuth(req);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { reservationId, page, onlyRelatedToGuest } = req.query;
    if (!reservationId) return res.status(400).json({ error: 'reservationId is required' });

    const data = await smoobuRequest(`/api/reservations/${encodeURIComponent(reservationId)}/messages`, {
      query: { page, onlyRelatedToGuest },
    });
    res.status(200).json(data);
  } catch (error) {
    sendError(res, error);
  }
}
