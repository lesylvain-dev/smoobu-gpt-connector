import { assertConnectorAuth, sendError, smoobuRequest } from './_lib/smoobu.js';

export default async function handler(req, res) {
  try {
    assertConnectorAuth(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const reservationId = req.query?.reservationId ?? req.body?.reservationId;
    const subject = req.body?.subject;
    const messageBody = req.body?.messageBody;

    if (!reservationId) return res.status(400).json({ error: 'reservationId is required' });
    if (typeof messageBody !== 'string' || !messageBody.trim()) {
      return res.status(400).json({ error: 'messageBody is required' });
    }

    const body = { messageBody: messageBody.trim() };
    if (typeof subject === 'string' && subject.trim()) body.subject = subject.trim();

    const data = await smoobuRequest(
      `/api/reservations/${encodeURIComponent(reservationId)}/messages/send-message-to-guest`,
      { method: 'POST', body }
    );
    res.status(200).json(data);
  } catch (error) {
    sendError(res, error);
  }
}
