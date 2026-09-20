import { isSpeechMode, VOICE_MAX_AUDIO_BYTES } from '@/lib/voice-contract';
import {
  bearerToken,
  runtimeEndpoint,
  runtimeTimeoutMs,
  type RuntimeConfigError,
} from '@/lib/chat-runtime';

export const runtime = 'nodejs';

const MAX_MULTIPART_BODY_BYTES = VOICE_MAX_AUDIO_BYTES + 16_384;

const SAFE_VOICE_ERRORS: Record<string, string> = {
  AUDIO_TOO_LARGE: 'The recording is larger than the 1 MB limit.',
  AUDIO_TOO_LONG: 'The recording is longer than the allowed limit.',
  EMPTY_AUDIO: 'No speech was detected. Please try recording again.',
  EMPTY_TRANSCRIPT: 'No clear speech was detected. Please try again.',
  INVALID_AUDIO: 'The recording must be a valid mono, 16 kHz WAV file.',
  INVALID_SPEECH_MODE: 'Choose English, Hindi, or Hinglish.',
  TRANSCRIPT_TOO_LONG: 'The transcript is longer than the chat limit. Please record a shorter question.',
  TRANSCRIPTION_BUSY: 'Transcription is busy. Please try again shortly.',
  TRANSCRIPTION_TIMEOUT: 'Transcription took too long. Please try again.',
  TRANSCRIPTION_UNAVAILABLE: 'Could not transcribe the recording. Please try again.',
  UNSUPPORTED_MEDIA_TYPE: 'The recording must be a WAV audio file.',
  VOICE_CONFIGURATION_ERROR: 'The voice service is not configured correctly. Contact support.',
};

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ status: 'error', code, message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        exceededLimit = true;
        chunks.length = 0;
        continue;
      }
      if (!exceededLimit) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (exceededLimit) return null;

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function POST(request: Request): Promise<Response> {
  const authorization = bearerToken(request);
  if (!authorization) return jsonError(401, 'unauthorized', 'A Bearer access token is required.');

  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(contentType)) {
    return jsonError(415, 'unsupported_media_type', 'Content-Type must be multipart/form-data.');
  }
  const contentLength = request.headers.get('content-length');
  const declaredLength = contentLength === null ? null : Number(contentLength);
  if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
    return jsonError(400, 'invalid_request', 'The recording upload is invalid. Please try again.');
  }
  if (declaredLength !== null && declaredLength > MAX_MULTIPART_BODY_BYTES) {
    return jsonError(413, 'audio_too_large', 'The recording is larger than the 1 MB limit.');
  }

  let boundedBody: ArrayBuffer | null;
  try {
    boundedBody = await readBoundedBody(request, MAX_MULTIPART_BODY_BYTES);
  } catch {
    return jsonError(400, 'invalid_audio', 'The recording upload is invalid. Please try again.');
  }
  if (boundedBody === null) {
    return jsonError(413, 'audio_too_large', 'The recording is larger than the 1 MB limit.');
  }

  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: boundedBody,
    }).formData();
  } catch {
    return jsonError(400, 'invalid_audio', 'The recording upload is invalid. Please try again.');
  }
  const audio = form.get('audio');
  const mode = form.get('mode');
  if (!(audio instanceof File)) return jsonError(400, 'invalid_audio', 'A WAV recording is required.');
  if (!isSpeechMode(mode)) return jsonError(400, 'invalid_speech_mode', 'Choose English, Hindi, or Hinglish.');
  if (!['audio/wav', 'audio/x-wav', 'audio/wave'].includes(audio.type.toLowerCase())) {
    return jsonError(415, 'unsupported_media_type', 'The recording must be a WAV audio file.');
  }
  if (audio.size <= 44) return jsonError(400, 'empty_audio', 'No speech was detected. Please try recording again.');
  if (audio.size > VOICE_MAX_AUDIO_BYTES) return jsonError(413, 'audio_too_large', 'The recording is larger than the 1 MB limit.');

  let endpoint: string;
  let timeoutMs: number;
  try {
    endpoint = runtimeEndpoint('voice/transcribe');
    timeoutMs = runtimeTimeoutMs();
  } catch (error) {
    if ((error as RuntimeConfigError).code === 'runtime_unavailable') {
      return jsonError(503, 'runtime_unavailable', 'The voice service is not available.');
    }
    throw error;
  }

  const forwardForm = new FormData();
  forwardForm.set('audio', audio, 'utterance.wav');
  forwardForm.set('mode', mode);
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
      headers: { Authorization: authorization, Accept: 'application/json' },
      body: forwardForm,
      signal: AbortSignal.any([request.signal, timeoutController.signal]),
      cache: 'no-store',
    });
  } catch {
    clearTimeout(timeoutHandle);
    if (timedOut) return jsonError(504, 'voice_timeout', 'Transcription took too long. Please try again.');
    if (request.signal.aborted) return jsonError(499, 'request_aborted', 'The request was cancelled.');
    return jsonError(502, 'voice_unavailable', 'The voice service could not be reached.');
  }
  clearTimeout(timeoutHandle);

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null) as { code?: unknown; message?: unknown } | null;
    const code = typeof body?.code === 'string' && Object.hasOwn(SAFE_VOICE_ERRORS, body.code) ? body.code : 'voice_error';
    const message = SAFE_VOICE_ERRORS[code] || 'Could not transcribe the recording. Please try again.';
    const status = [400, 413, 415, 422, 429, 503, 504].includes(upstream.status) ? upstream.status : 502;
    return jsonError(status, code, message);
  }

  const body = await upstream.json().catch(() => null) as { status?: unknown; transcript?: unknown; detectedLanguages?: unknown } | null;
  if (body?.status !== 'success' || typeof body.transcript !== 'string' || !Array.isArray(body.detectedLanguages)) {
    return jsonError(502, 'invalid_voice_response', 'The voice service returned an invalid transcription.');
  }
  return Response.json({ status: 'success', transcript: body.transcript, detectedLanguages: body.detectedLanguages }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
