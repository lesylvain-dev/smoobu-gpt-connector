import { createRemoteJWKSet, jwtVerify } from 'jose';

export const MCP_RESOURCE = 'https://smoobu-gpt-connector.vercel.app/api/mcp';
export const RESOURCE_METADATA = 'https://smoobu-gpt-connector.vercel.app/.well-known/oauth-protected-resource';
let cachedIssuer;
let cachedKeys;

export function oauthIssuer() {
  const value = (process.env.AUTHKIT_DOMAIN || '').trim();
  if (!value) throw Object.assign(new Error('OAuth configuration required'), { status: 503 });
  const url = new URL(value.startsWith('https://') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.authkit.app') || url.port
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw Object.assign(new Error('Invalid AuthKit domain'), { status: 503 });
  }
  return url.origin;
}

export function protectedResourceMetadata() {
  return { resource: MCP_RESOURCE, authorization_servers: [oauthIssuer()], bearer_methods_supported: ['header'] };
}

export async function verifyOAuthToken(token, keySet) {
  const issuer = oauthIssuer();
  const owner = (process.env.MCP_ALLOWED_USER_ID || '').trim();
  if (!owner) throw Object.assign(new Error('OAuth owner configuration required'), { status: 503 });
  if (!cachedKeys || cachedIssuer !== issuer) {
    cachedIssuer = issuer;
    cachedKeys = createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`));
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet || cachedKeys, {
      issuer, audience: MCP_RESOURCE, algorithms: ['RS256'], requiredClaims: ['exp', 'sub', 'iat'],
    }));
  } catch {
    throw Object.assign(new Error('Invalid OAuth access token'), { status: 401 });
  }
  if (payload.sub !== owner) {
    throw Object.assign(new Error('This account cannot access Copilot Smoobu'), { status: 403 });
  }
  return payload;
}

export function oauthChallenge(res) {
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${RESOURCE_METADATA}"`);
}
