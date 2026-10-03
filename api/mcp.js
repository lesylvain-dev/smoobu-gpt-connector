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
import { assertConnectorAuth, sendError } from './_lib/smoobu.js';

const handlers = {
  healthCheck: health, listApartments: apartments, listReservations: reservations,
  getRevenueSummary: revenue, getStats: stats, getReservationMessages: messages, getRates: rates,
};

export function createServer(headers) {
  const server = new McpServer({ name: 'smoobu-gpt-connector', version: '1.1.0' });
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
  return server;
}

export default async function handler(req, res) {
  // Native clients may use Bearer authentication; REST clients keep x-connector-key.
  const headers = { ...req.headers };
  if (!headers['x-connector-key'] && typeof headers.authorization === 'string'
      && headers.authorization.startsWith('Bearer ')) {
    headers['x-connector-key'] = headers.authorization.slice(7);
  }
  try {
    const allowed = (process.env.MCP_ALLOWED_ORIGINS || 'https://chatgpt.com').split(',').map(s => s.trim());
    if (req.headers.origin && !allowed.includes(req.headers.origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
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
    if (!res.headersSent) sendError(res, error);
  }
}
