import { CognitoJwtVerifier } from 'aws-jwt-verify';
import outputs from '../../amplify_outputs.json';

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = 'Authentication is required.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthenticationConfigurationError extends Error {
  readonly status = 503;

  constructor(message = 'Authentication is not configured.') {
    super(message);
    this.name = 'AuthenticationConfigurationError';
  }
}

type AuthOutputs = { auth?: { user_pool_id?: string; user_pool_client_id?: string } };

const authOutputs = outputs as AuthOutputs;
const verifierCache = new Map<string, ReturnType<typeof CognitoJwtVerifier.create>>();

function authConfig(): { userPoolId: string; clientId: string } {
  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim() || authOutputs.auth?.user_pool_id?.trim() || 'ap-south-1_oQDlsmrCQ';
  const clientId = process.env.COGNITO_CLIENT_ID?.trim() || authOutputs.auth?.user_pool_client_id?.trim() || '2a80r6cf9l8k0a3tvevg5uvqi3';
  if (!userPoolId || !clientId) throw new AuthenticationConfigurationError();
  return { userPoolId, clientId };
}

export async function requirePrincipal(request: Request): Promise<string> {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) throw new AuthenticationError();

  const { userPoolId, clientId } = authConfig();
  const cacheKey = `${userPoolId}:${clientId}`;
  let verifier = verifierCache.get(cacheKey);
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      tokenUse: 'access',
    });
    verifierCache.set(cacheKey, verifier);
  }

  try {
    const payload = await verifier.verify(match[1]);
    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') throw new AuthenticationError();
    return payload.sub;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError('Authentication was rejected.');
  }
}
