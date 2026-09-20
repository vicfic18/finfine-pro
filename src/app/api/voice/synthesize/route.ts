import { isSpeechMode } from '@/lib/voice-contract';
import { isRecord, isUuid } from '@/lib/chat-contract';
import {
  bearerToken,
  runtimeEndpoint,
  runtimeTimeoutMs,
  type RuntimeConfigError,
} from '@/lib/chat-runtime';

export const runtime = 'nodejs';

const SAFE_VOICE_ERRORS: Record<string, string> = {
  ANSWER_NOT_FOUND: 'The completed answer is not available for speech.',
  CONVERSATION_NOT_FOUND: 'This conversation is no longer available.',
  SESSION_UNAVAILABLE: 'This conversation is no longer available.',
  SYNTHESIS_UNAVAILABLE: 'Could not generate speech. You can retry playback.',
  VOICE_CONFIGURATION_ERROR: 'The voice service is not configured correctly. Contact support.',
};

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ status: 'error', code, message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = bearerToken(request);
  if (!authorization) return jsonError(401, 'unauthorized', 'A Bearer access token is required.');

  let body: unknown;
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
      return jsonError(415, 'unsupported_media_type', 'Content-Type must be JSON.');
    }
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
  if (!isRecord(body) || !isUuid(String(body.sessionId ?? '')) || !isUuid(String(body.requestId ?? '')) || !isSpeechMode(body.mode)) {
    return jsonError(400, 'invalid_request', 'sessionId, requestId, and a valid speech mode are required.');
  }

  let endpoint: string;
  let timeoutMs: number;
  try {
    endpoint = runtimeEndpoint('voice/synthesize');
    timeoutMs = runtimeTimeoutMs();
  } catch (error) {
    if ((error as RuntimeConfigError).code === 'runtime_unavailable') {
      return jsonError(503, 'runtime_unavailable', 'The voice service is not available.');
    }
    throw error;
  }

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg, application/json',
      },
      body: JSON.stringify({ sessionId: body.sessionId, requestId: body.requestId, mode: body.mode }),
      signal: AbortSignal.any([request.signal, timeoutController.signal]),
      cache: 'no-store',
    });
  } catch {
    clearTimeout(timeoutHandle);
    if (timedOut) return jsonError(504, 'voice_timeout', 'Speech generation took too long. You can retry playback.');
    if (request.signal.aborted) return jsonError(499, 'request_aborted', 'The request was cancelled.');
    return jsonError(502, 'voice_unavailable', 'The voice service could not be reached.');
  }
  clearTimeout(timeoutHandle);

  if (!upstream.ok) {
    const error = await upstream.json().catch(() => null) as { code?: unknown; message?: unknown } | null;
    const code = typeof error?.code === 'string' && Object.hasOwn(SAFE_VOICE_ERRORS, error.code) ? error.code : 'voice_error';
    const message = SAFE_VOICE_ERRORS[code] || 'Could not generate speech. You can retry playback.';
    const status = [400, 404, 409, 429, 503, 504].includes(upstream.status) ? upstream.status : 502;
    return jsonError(status, code, message);
  }
  if (!upstream.headers.get('content-type')?.toLowerCase().startsWith('audio/mpeg')) {
    return jsonError(502, 'invalid_voice_response', 'The voice service returned an invalid audio response.');
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
