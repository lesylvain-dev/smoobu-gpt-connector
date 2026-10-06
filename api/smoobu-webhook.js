import { sendError } from './_lib/smoobu.js';

async function postToSlack({ reservationId, messageId, sender }) {
  const webhookUrl = process.env.slack_webhook_url;
  if (!webhookUrl) {
    throw new Error('slack_webhook_url is not configured');
  }

  const senderLabel =
    sender?.name ||
    sender?.email ||
    (typeof sender === 'string' ? sender : null) ||
    'Voyageur';

  const text = [
    '🔔 Nouveau message Smoobu',
    `Voyageur : ${senderLabel}`,
    `Réservation : ${reservationId}`,
    `Message ID : ${messageId}`,
    '',
    'Ouvre ChatGPT / Copilot Smoobu pour récupérer la conversation et préparer une réponse.',
    '⚠️ Aucune réponse ne doit être envoyée sans validation explicite de Sylvain.',
  ].join('\n');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Slack webhook failed (${response.status}): ${details}`);
  }
}

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

    await postToSlack({ reservationId, messageId, sender });

    return res.status(200).json({
      received: true,
      action: 'newMessage',
      reservationId,
      messageId,
      sender,
      slackNotified: true,
      requiresUserApprovalBeforeReply: true,
    });
  } catch (error) {
    sendError(res, error);
  }
}
