const DEFAULT_TIMEOUT_MS = 100_000;
const MAX_TIMEOUT_MS = 120_000;

export type RuntimeConfigError = Error & { code: 'runtime_unavailable' };

export function runtimeConfigError(message: string): RuntimeConfigError {
  const error = new Error(message) as RuntimeConfigError;
  error.code = 'runtime_unavailable';
  return error;
}

export function runtimeEndpoint(path = ''): string {
  const configuredUrl = process.env.FINFINE_AGENT_RUNTIME_URL?.trim();
  if (!configuredUrl) throw runtimeConfigError('FINFINE_AGENT_RUNTIME_URL is not configured.');

  let endpoint: URL;
  try {
    endpoint = new URL(configuredUrl);
  } catch {
    throw runtimeConfigError('FINFINE_AGENT_RUNTIME_URL is invalid.');
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw runtimeConfigError('FINFINE_AGENT_RUNTIME_URL must use HTTP or HTTPS.');
  }
  if (endpoint.username || endpoint.password) {
    throw runtimeConfigError('FINFINE_AGENT_RUNTIME_URL must not contain credentials.');
  }

  if (endpoint.pathname === '' || endpoint.pathname === '/') endpoint.pathname = '/invocations';
  if (path) endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  return endpoint.toString();
}

export function runtimeTimeoutMs(): number {
  const configuredTimeout = process.env.FINFINE_CHAT_PROXY_TIMEOUT_MS;
  if (configuredTimeout === undefined || configuredTimeout.trim() === '') return DEFAULT_TIMEOUT_MS;
  const timeout = Number(configuredTimeout);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw runtimeConfigError('FINFINE_CHAT_PROXY_TIMEOUT_MS must be a positive integer.');
  }
  return Math.min(timeout, MAX_TIMEOUT_MS);
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  return authorization && /^Bearer\s+\S+(?:\s*)$/i.test(authorization) ? authorization : null;
}

export function upstreamErrorStatus(status: number): { status: number; code: string; message: string } {
  if (status === 401 || status === 403) {
    return {
      status,
      code: status === 401 ? 'unauthorized' : 'forbidden',
      message: status === 401 ? 'Authentication was rejected.' : 'Access to the agent was denied.',
    };
  }
  if (status === 404) {
    return { status: 404, code: 'conversation_not_found', message: 'This conversation is no longer available.' };
  }
  if (status === 408 || status === 429) {
    return { status: 429, code: 'runtime_busy', message: 'The agent is busy. Please try again shortly.' };
  }
  return { status: 502, code: 'runtime_error', message: 'The agent could not complete the request.' };
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function runtimeFetch(
  request: Request,
  path: string,
  method: 'GET' | 'DELETE',
): Promise<{ response: Response | null; error: 'config' | 'timeout' | 'aborted' | 'unreachable' | null }> {
  let endpoint: string;
  let timeoutMs: number;
  try {
    endpoint = runtimeEndpoint(path);
    timeoutMs = runtimeTimeoutMs();
  } catch {
    return { response: null, error: 'config' };
  }

  const authorization = bearerToken(request);
  if (!authorization) return { response: null, error: null };
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method,
      headers: { Authorization: authorization, Accept: 'application/json' },
      signal: AbortSignal.any([request.signal, controller.signal]),
      cache: 'no-store',
    });
    return { response, error: null };
  } catch {
    if (timedOut) return { response: null, error: 'timeout' };
    if (request.signal.aborted) return { response: null, error: 'aborted' };
    return { response: null, error: 'unreachable' };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
