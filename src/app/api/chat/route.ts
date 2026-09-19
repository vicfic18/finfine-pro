import {
  isChatSuccessResponse,
  isRecord,
  parseChatRequest,
  type ChatErrorResponse,
  type ChatSuccessResponse,
} from '@/lib/chat-contract';

// FastAPI defaults to a 90-second agent timeout. Leave enough time for it to
// cancel Strands and return a safe response before the proxy closes the link.
const DEFAULT_TIMEOUT_MS = 100_000;
const MAX_TIMEOUT_MS = 120_000;

type RuntimeConfigError = Error & { code: 'runtime_unavailable' };

function jsonResponse(
  body: ChatSuccessResponse | ChatErrorResponse,
  status: number,
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(
  requestId: string | null,
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse({ status: 'error', requestId, code, message }, status);
}

function runtimeConfigError(message: string): RuntimeConfigError {
  const error = new Error(message) as RuntimeConfigError;
  error.code = 'runtime_unavailable';
  return error;
}

function runtimeEndpoint(): string {
  const configuredUrl = process.env.FINFINE_AGENT_RUNTIME_URL?.trim();
  if (!configuredUrl) {
    throw runtimeConfigError('FINFINE_AGENT_RUNTIME_URL is not configured.');
  }

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

  // The documented local and AgentCore contract is POST /invocations. An
  // explicit path is preserved so deployed runtimes can expose a custom route.
  if (endpoint.pathname === '' || endpoint.pathname === '/') {
    endpoint.pathname = '/invocations';
  }

  return endpoint.toString();
}

function runtimeTimeoutMs(): number {
  const configuredTimeout = process.env.FINFINE_CHAT_PROXY_TIMEOUT_MS;
  if (configuredTimeout === undefined || configuredTimeout.trim() === '') {
    return DEFAULT_TIMEOUT_MS;
  }

  const timeout = Number(configuredTimeout);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw runtimeConfigError('FINFINE_CHAT_PROXY_TIMEOUT_MS must be a positive integer.');
  }

  return Math.min(timeout, MAX_TIMEOUT_MS);
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  return /^(?:application\/json|application\/[^;]+\+json)(?:\s*;|$)/i.test(contentType);
}

function upstreamErrorStatus(status: number): { status: number; code: string; message: string } {
  if (status === 401 || status === 403) {
    return {
      status,
      code: status === 401 ? 'unauthorized' : 'forbidden',
      message: status === 401 ? 'Authentication was rejected.' : 'Access to the agent was denied.',
    };
  }
  if (status === 408 || status === 429) {
    return {
      status: 429,
      code: 'runtime_busy',
      message: 'The agent is busy. Please try again shortly.',
    };
  }
  return {
    status: 502,
    code: 'runtime_error',
    message: 'The agent could not complete the request.',
  };
}

function safeRuntimeError(
  value: unknown,
  requestId: string,
): { status: number; code: string; message: string } | null {
  if (!isRecord(value) || value.status !== 'error' || value.code !== 'SESSION_UNAVAILABLE') {
    return null;
  }
  if (value.requestId !== requestId) {
    return null;
  }
  return {
    status: 409,
    code: 'SESSION_UNAVAILABLE',
    message: 'This chat session is no longer available. Start a new chat to continue.',
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    if (!isJsonContentType(request.headers.get('content-type'))) {
      return errorResponse(null, 415, 'unsupported_media_type', 'Content-Type must be JSON.');
    }
    body = await request.json();
  } catch {
    return errorResponse(null, 400, 'invalid_json', 'Request body must be valid JSON.');
  }

  const parsed = parseChatRequest(body);
  if (!parsed.ok) {
    return errorResponse(parsed.requestId, 400, parsed.code, parsed.message);
  }
  const { prompt, requestId, sessionId } = parsed.value;

  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer\s+\S+(?:\s*)$/i.test(authorization)) {
    return errorResponse(requestId, 401, 'unauthorized', 'A Bearer access token is required.');
  }

  let endpoint: string;
  let timeoutMs: number;
  try {
    endpoint = runtimeEndpoint();
    timeoutMs = runtimeTimeoutMs();
  } catch (error) {
    if ((error as RuntimeConfigError).code === 'runtime_unavailable') {
      return errorResponse(requestId, 503, 'runtime_unavailable', 'The agent runtime is not available.');
    }
    throw error;
  }

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  const signal = AbortSignal.any([request.signal, timeoutController.signal]);

  let runtimeResponse: Response;
  try {
    runtimeResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        prompt,
        requestId,
        ...(sessionId === undefined ? {} : { sessionId }),
      }),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (timedOut) {
      return errorResponse(requestId, 504, 'runtime_timeout', 'The agent took too long to respond.');
    }
    if (request.signal.aborted) {
      // The client disconnected. There is no useful response to send, but a
      // JSON error keeps direct handler tests and non-browser callers safe.
      return errorResponse(requestId, 499, 'request_aborted', 'The request was cancelled.');
    }
    console.error('FinFine agent runtime request failed:', error);
    return errorResponse(requestId, 502, 'runtime_unreachable', 'The agent could not be reached.');
  } finally {
    clearTimeout(timeoutHandle);
  }

  const upstreamBody = await readJson(runtimeResponse);
  const safeError = safeRuntimeError(upstreamBody, requestId);
  if (safeError) {
    return errorResponse(requestId, safeError.status, safeError.code, safeError.message);
  }

  if (!runtimeResponse.ok) {
    const mapped = upstreamErrorStatus(runtimeResponse.status);
    return errorResponse(requestId, mapped.status, mapped.code, mapped.message);
  }

  if (!isChatSuccessResponse(upstreamBody)) {
    return errorResponse(requestId, 502, 'invalid_runtime_response', 'The agent returned an invalid response.');
  }

  if (
    upstreamBody.requestId !== requestId ||
    (sessionId !== undefined && upstreamBody.sessionId !== sessionId)
  ) {
    return errorResponse(requestId, 502, 'invalid_runtime_response', 'The agent returned an invalid response.');
  }

  return jsonResponse(upstreamBody, 200);
}
