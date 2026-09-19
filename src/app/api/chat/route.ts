import {
  isConversationListResponse,
  isChatSuccessResponse,
  isRecord,
  parseChatRequest,
  type ChatErrorResponse,
  type ChatSuccessResponse,
} from '@/lib/chat-contract';
import {
  bearerToken,
  readJson,
  runtimeEndpoint,
  runtimeFetch,
  runtimeTimeoutMs,
  upstreamErrorStatus,
  type RuntimeConfigError,
} from '@/lib/chat-runtime';

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

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  return /^(?:application\/json|application\/[^;]+\+json)(?:\s*;|$)/i.test(contentType);
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

  const authorization = bearerToken(request);
  if (!authorization) {
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
  const wantsStream = request.headers.get('accept')?.includes('application/x-ndjson') ?? false;

  let runtimeResponse: Response;
  try {
    runtimeResponse = await fetch(wantsStream ? runtimeEndpoint('stream') : endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: wantsStream ? 'application/x-ndjson' : 'application/json',
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
    clearTimeout(timeoutHandle);
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
  }

  if (wantsStream && runtimeResponse.ok) {
    if (!runtimeResponse.body || !runtimeResponse.headers.get('content-type')?.includes('application/x-ndjson')) {
      clearTimeout(timeoutHandle);
      return errorResponse(requestId, 502, 'invalid_runtime_response', 'The agent returned an invalid response.');
    }
    const upstreamReader = runtimeResponse.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await upstreamReader.read();
          if (chunk.done) {
            clearTimeout(timeoutHandle);
            controller.close();
          } else {
            controller.enqueue(chunk.value);
          }
        } catch (error) {
          clearTimeout(timeoutHandle);
          controller.error(error);
        }
      },
      async cancel(reason) {
        clearTimeout(timeoutHandle);
        await upstreamReader.cancel(reason);
      },
    });
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  clearTimeout(timeoutHandle);

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

export async function GET(request: Request): Promise<Response> {
  if (!bearerToken(request)) return errorResponse(null, 401, 'unauthorized', 'A Bearer access token is required.');
  const result = await runtimeFetch(request, 'conversations', 'GET');
  if (!result.response) {
    if (result.error === 'config') return errorResponse(null, 503, 'runtime_unavailable', 'The agent runtime is not available.');
    if (result.error === 'timeout') return errorResponse(null, 504, 'runtime_timeout', 'The agent took too long to respond.');
    if (result.error === 'aborted') return errorResponse(null, 499, 'request_aborted', 'The request was cancelled.');
    return errorResponse(null, 502, 'runtime_unreachable', 'The agent could not be reached.');
  }
  const upstreamBody = await readJson(result.response);
  if (!result.response.ok) {
    const mapped = upstreamErrorStatus(result.response.status);
    return errorResponse(null, mapped.status, mapped.code, mapped.message);
  }
  if (!isConversationListResponse(upstreamBody)) {
    return errorResponse(null, 502, 'invalid_runtime_response', 'The agent returned an invalid response.');
  }
  return Response.json(upstreamBody, { headers: { 'Cache-Control': 'no-store' } });
}
