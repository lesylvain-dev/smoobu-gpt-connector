import { sendError, smoobuRequest } from './_lib/smoobu.js';

function findMessages(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['messages', 'items', 'data', 'results']) {
    if (Array.isArray(data?.[key])) return data[key];
    if (data?.[key] && data[key] !== data) {
      const nested = findMessages(data[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function messageText(message) {
  for (const field of ['messageBody', 'body', 'message', 'text', 'content']) {
    const value = message?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function fetchMessage(reservationId, messageId) {
  const path = `/api/reservations/${encodeURIComponent(reservationId)}/messages`;
  // Smoobu's messages endpoint is paginated. Check a few pages to find the exact event.
  for (let page = 1; page <= 3; page++) {
    const data = await smoobuRequest(path, { query: { page } });
    const messages = findMessages(data);
    console.info('smoobu.message_lookup', JSON.stringify({
      page,
      resultCount: messages.length,
      totalItems: Number.isFinite(data?.total_items) ? data.total_items : null,
      pageCount: Number.isFinite(data?.page_count) ? data.page_count : null,
      matchFound: messages.some(item => String(item?.id ?? item?.messageId ?? '') === String(messageId)),
    }));
    const matching = messages.find((item) => String(item?.id ?? item?.messageId ?? '') === String(messageId));
    if (matching) return messageText(matching);
    if (!messages.length) break;
  }
  return null;
}

async function postToSlack({ reservationId, messageId, sender, body, lookupFailed }) {
  const webhookUrl = process.env.slack_webhook_url || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('Slack webhook URL is not configured');

  const senderLabel =
    sender?.name ||
    sender?.email ||
    (typeof sender === 'string' ? sender : null) ||
    'Voyageur';

  const text = [
    '🔔 Nouveau message Smoobu',
    `Expéditeur : ${senderLabel}`,
    `Réservation : ${reservationId}`,
    `Message ID : ${messageId}`,
    '',
    body ? `Message reçu :\n${body.slice(0, 2500)}` : 'Contenu non disponible pour le moment : à consulter dans Smoobu.',
    lookupFailed ? '⚠️ Lecture Smoobu impossible : vérifier la connexion API.' : '',
    '',
    'Dans ChatGPT, demande une proposition de réponse pour cette réservation.',
    '⚠️ Aucun message ne sera envoyé au voyageur sans validation explicite de Sylvain.',
  ].filter(Boolean).join('\n');

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

    // Prefer the exact message included in the event when Smoobu provides it.
    // Never substitute another message from the same reservation.
    let body = messageText(event.data) || messageText(event.data?.message);
    console.info('smoobu.webhook_shape', JSON.stringify({
      action: event.action,
      topLevelFields: Object.keys(event).filter(k => !/secret|token|key|authorization/i.test(k)),
      dataFields: Object.keys(event.data || {}).filter(k => !/secret|token|key|authorization/i.test(k)),
      senderType: typeof sender,
      inlineMessageFound: Boolean(body),
    }));
    let lookupFailed = false;
    try {
      if (!body) body = await fetchMessage(reservationId, messageId);
    } catch (error) {
      lookupFailed = true;
      console.error('Smoobu message lookup failed:', error.message);
    }

    console.info('smoobu.message_result', JSON.stringify({
      messageFound: Boolean(body),
      lookupFailed,
    }));
    await postToSlack({ reservationId, messageId, sender, body, lookupFailed });

    return res.status(200).json({
      received: true,
      action: 'newMessage',
      reservationId,
      messageId,
      slackNotified: true,
      messageIncluded: Boolean(body),
      requiresUserApprovalBeforeReply: true,
    });
  } catch (error) {
    console.error('Smoobu webhook error:', error.message);
    sendError(res, error);
  }
}
