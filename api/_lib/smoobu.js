import crypto from 'node:crypto';

const BASE_URL = 'https://login.smoobu.com';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function sha256Hex(value = '') {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalQuery(url) {
  const entries = [...url.searchParams.entries()]
    .sort(([aKey, aVal], [bKey, bVal]) => aKey.localeCompare(bKey) || aVal.localeCompare(bVal));
  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export async function smoobuRequest(path, { method = 'GET', query = {}, body } = {}) {
  const apiKey = requireEnv('SMOOBU_API_KEY');
  const apiSecret = requireEnv('SMOOBU_API_SECRET');
  const url = new URL(path, BASE_URL);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.append(key, String(value));
    }
  }

  const payload = body === undefined ? '' : JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const canonical = [
    method.toUpperCase(),
    url.pathname,
    canonicalQuery(url),
    timestamp,
    nonce,
    sha256Hex(payload),
    apiKey,
  ].join('\n');

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(canonical)
    .digest('base64');

  const response = await fetch(url, {
    method,
    headers: {
      'X-API-Key': apiKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: payload || undefined,
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(`Smoobu API error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function assertConnectorAuth(req) {
  const expected = requireEnv('CONNECTOR_API_KEY');
  const supplied = req.headers['x-connector-key'];
  if (!supplied || supplied !== expected) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
}

export function sendError(res, error) {
  const status = error.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Connector error' : error.message,
    details: error.data || undefined,
  });
}
