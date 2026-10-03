import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import handler from '../api/mcp.js';

 test('HTTP MCP: authentication, discovery, eight tools and validation', async () => {
  process.env.CONNECTOR_API_KEY = 'test-only';
  process.env.SMOOBU_API_KEY = 'test';
  process.env.SMOOBU_API_SECRET = 'test';
  const actualFetch = globalThis.fetch;
  const upstream = [];
  globalThis.fetch = async (url, options) => {
    if (new URL(url).hostname !== 'login.smoobu.com') return actualFetch(url, options);
    upstream.push(String(url));
    return new Response(JSON.stringify({ apartments: [{ id: 1, name: 'Test' }], bookings: [], page_count: 1 }), { status: 200 });
  };
  const app = http.createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
    let body = '';
    for await (const chunk of req) body += chunk;
    req.body = body ? JSON.parse(body) : undefined;
    await handler(req, res);
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const url = new URL(`http://127.0.0.1:${app.address().port}/api/mcp`);
  const client = new Client({ name: 'test', version: '1' });
  try {
    assert.equal((await actualFetch(url, { method: 'POST' })).status, 401);
    assert.equal((await actualFetch(url, { method: 'POST', headers: { 'x-connector-key': 'test-only', Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await actualFetch(url, { headers: { 'x-connector-key': 'test-only' } })).status, 405);
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'x-connector-key': 'test-only' } } }));
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['healthCheck', 'listApartments', 'listReservations', 'getRevenueSummary', 'getStats', 'getReservationMessages', 'getRates', 'sendReservationMessage'].sort());
    const args = { getStats: { from: '2026-09-01', to: '2026-09-30' }, getRevenueSummary: { from: '2026-09-01', to: '2026-09-30' }, getReservationMessages: { reservationId: 123, onlyRelatedToGuest: true }, getRates: { start_date: '2026-09-01', end_date: '2026-09-30', apartments: '1,2' }, listReservations: { apartmentId: 1, page: 2 }, sendReservationMessage: { reservationId: 123, subject: 'Test', messageBody: 'Bonjour' } };
    for (const tool of tools) {
      const result = await client.callTool({ name: tool.name, arguments: args[tool.name] || {} });
      assert.ok(!result.isError, tool.name);
    }
    assert.ok(upstream.some(url => url.includes('/123/messages?onlyRelatedToGuest=true')));
    assert.ok(upstream.some(url => url.includes('/123/messages/send-message-to-guest')));
    assert.ok(upstream.some(url => url.includes('apartments%5B%5D=1') && url.includes('apartments%5B%5D=2')));
    const before = upstream.length;
    const invalid = await client.callTool({ name: 'getStats', arguments: {} });
    assert.equal(invalid.isError, true);
    assert.equal(upstream.length, before);
    globalThis.fetch = async (url, options) => new URL(url).hostname === 'login.smoobu.com'
      ? new Response('{}', { status: 401 }) : actualFetch(url, options);
    assert.equal((await client.callTool({ name: 'listApartments', arguments: {} })).isError, true);
  } finally {
    await client.close();
    await new Promise(resolve => app.close(resolve));
    globalThis.fetch = actualFetch;
  }
});
