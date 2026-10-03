import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import openapi from './openapi.js';
import health from './health.js';
import apartments from './apartments.js';
import reservations from './reservations.js';
import revenue from './revenue.js';
import stats from './stats.js';
import messages from './messages.js';
import rates from './rates.js';
import sendMessage from './send-message.js';
import { assertConnectorAuth, sendError } from './_lib/smoobu.js';
import { verifyOAuthToken, oauthChallenge } from './_lib/oauth.js';

const handlers = {
  healthCheck: health, listApartments: apartments, listReservations: reservations,
  getRevenueSummary: revenue, getStats: stats, getReservationMessages: messages, getRates: rates,
};

export function createServer(headers) {
  const server = new McpServer({ name: 'smoobu-gpt-connector', version: '1.2.0' });
  let spec;
  openapi({ method: 'GET' }, { status() { return this; }, json(value) { spec = value; } });
  for (const item of Object.values(spec.paths)) {
    const operation = item.get;
    const shape = {};
    for (const parameter of operation.parameters || []) {
      let field = parameter.schema.type === 'integer' ? z.number().int()
        : parameter.schema.type === 'boolean' ? z.boolean() : z.string();
      if (parameter.description) field = field.describe(parameter.description);
      shape[parameter.name] = parameter.required ? field : field.optional();
    }
    server.registerTool(operation.operationId, {
      description: operation.summary,
      inputSchema: z.object(shape).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (args) => {
      let status = 200;
      let data;
      await handlers[operation.operationId]({ method: 'GET', headers, query: args }, {
        status(value) { status = value; return this; },
        json(value) { data = value; return this; },
      });
      return { content: [{ type: 'text', text: JSON.stringify(data) }], ...(status >= 400 ? { isError: true } : {}) };
    });
  }
  server.registerTool('sendReservationMessage', {
    description: 'Send a message to the guest for a Smoobu reservation. Only call this after the user has explicitly approved the exact message to send.',
    inputSchema: z.object({
      reservationId: z.number().int().describe('Smoobu reservation ID'),
      messageBody: z.string().min(1).describe('Exact approved message to send to the guest'),
      subject: z.string().optional().describe('Optional message subject'),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (args) => {
    let status = 200;
    let data;
    await sendMessage({ method: 'POST', headers, query: { reservationId: args.reservationId }, body: { messageBody: args.messageBody, subject: args.subject } }, {
      status(value) { status = value; return this; },
      json(value) { data = value; return this; },
    });
    return { content: [{ type: 'text', text: JSON.stringify(data) }], ...(status >= 400 ? { isError: true } : {}) };
  });
  return server;
}

export default async function handler(req, res) {
  const headers = { ...req.headers };
  try {
    const allowed = (process.env.MCP_ALLOWED_ORIGINS || 'https://chatgpt.com').split(',').map(s => s.trim());
    if (req.headers.origin && !allowed.includes(req.headers.origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    const configured = Boolean(process.env.AUTHKIT_DOMAIN || process.env.MCP_ALLOWED_USER_ID);
    if (configured) {
      const token = headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) {
        oauthChallenge(res);
        return res.status(401).json({ error: 'OAuth login required' });
      }
      await verifyOAuthToken(token);
      // Existing handlers continue to use the server-side connector key.
      // Neither this key nor the OAuth token is returned to the model.
      headers['x-connector-key'] = (process.env.CONNECTOR_API_KEY || process.env.GPT_CONNECTOR_KEY || '').trim();
      delete headers.authorization;
    } else if (!headers['x-connector-key']) {
      oauthChallenge(res);
      return res.status(401).json({ error: 'OAuth setup pending' });
    }
    assertConnectorAuth({ headers });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end();
    }
    const server = createServer(headers);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      if (error.status === 401) oauthChallenge(res);
      sendError(res, error);
    }
  }
}
