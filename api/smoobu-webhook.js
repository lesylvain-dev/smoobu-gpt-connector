import { sendError } from './_lib/smoobu.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const event = req.body || {};
    if (event.action !== 'newMessage') return res.status(200).json({ received: true, ignored: true });

    const reservationId = event.data?.booking?.id;
    const messageId = event.data?.id;
    const sender = event.data?.sender;
    if (!reservationId || !messageId) {
      return res.status(400).json({ error: 'Invalid newMessage webhook payload' });
    }

    // Acknowledge the event. The MCP/ChatGPT notification layer can use this
    // reservation and message id to retrieve the full conversation and propose a reply.
    return res.status(200).json({
      received: true,
      action: 'newMessage',
      reservationId,
      messageId,
      sender,
      requiresUserApprovalBeforeReply: true,
    });
  } catch (error) {
    sendError(res, error);
  }
}
