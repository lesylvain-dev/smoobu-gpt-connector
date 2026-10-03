import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyOAuthToken, protectedResourceMetadata, MCP_RESOURCE } from '../api/_lib/oauth.js';
import metadataHandler from '../api/oauth-metadata.js';
import handler from '../api/mcp.js';

test('OAuth rejects invalid tokens and every user except the configured owner', async () => {
  process.env.AUTHKIT_DOMAIN = 'test.authkit.app';
  process.env.MCP_ALLOWED_USER_ID = 'user_owner';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey); key.kid = 'test';
  const keys = createLocalJWKSet({ keys: [key] });
  const token = (claims = {}) => new SignJWT({ sub: 'user_owner', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuedAt()
    .setIssuer(claims.iss || 'https://test.authkit.app')
    .setAudience(claims.aud || MCP_RESOURCE)
    .setExpirationTime(claims.exp ?? '5m').sign(privateKey);
  assert.equal((await verifyOAuthToken(await token(), keys)).sub, 'user_owner');
  await assert.rejects(verifyOAuthToken(await token({ sub: 'user_other' }), keys), { status: 403 });
  for (const claims of [{ iss: 'https://evil.example' }, { aud: 'other-app' }, { exp: 1 }]) {
    await assert.rejects(verifyOAuthToken(await token(claims), keys), { status: 401 });
  }
  await assert.rejects(verifyOAuthToken('not-a-jwt', keys), { status: 401 });
  delete process.env.MCP_ALLOWED_USER_ID;
  await assert.rejects(verifyOAuthToken(await token(), keys), { status: 503 });
  assert.deepEqual(protectedResourceMetadata(), { resource: MCP_RESOURCE, authorization_servers: ['https://test.authkit.app'], bearer_methods_supported: ['header'] });
  process.env.AUTHKIT_DOMAIN = 'https://evil.example';
  assert.throws(protectedResourceMetadata, { status: 503 });
});

test('Metadata and authentication never expose a secret or trust the old raw Bearer key', async () => {
  process.env.AUTHKIT_DOMAIN = 'test.authkit.app';
  process.env.MCP_ALLOWED_USER_ID = 'user_owner';
  process.env.CONNECTOR_API_KEY = 'test-only-key';
  const response = () => ({ headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k]=v; }, status(s) { this.statusCode=s; return this; }, json(data) { this.data=data; return this; }, end() {} });
  const meta = response(); metadataHandler({ method: 'GET' }, meta);
  assert.equal(meta.statusCode, 200);
  for (const headers of [{}, { authorization: 'Bearer test-only-key' }, { 'x-connector-key': 'test-only-key' }]) {
    const res = response(); await handler({ method: 'POST', headers }, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.headers['WWW-Authenticate'], /resource_metadata/);
    assert.ok(!JSON.stringify(res.data).includes('test-only-key'));
  }
  delete process.env.AUTHKIT_DOMAIN;
  const pending = response(); metadataHandler({ method: 'GET' }, pending);
  assert.equal(pending.statusCode, 503);
});
