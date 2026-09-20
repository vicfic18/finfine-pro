import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { POST as TRANSCRIBE } from '../src/app/api/voice/transcribe/route';
import { POST as SYNTHESIZE } from '../src/app/api/voice/synthesize/route';

const SESSION_ID = '557dbe23-8e61-41f4-8e42-3925b0eb945e';
const REQUEST_ID = '315b4a4e-d5f8-4b21-911c-37bb629e869d';
const originalFetch = globalThis.fetch;
const originalRuntimeUrl = process.env.FINFINE_AGENT_RUNTIME_URL;

function voiceForm(mode = 'english', audio = new Blob([new Uint8Array(64)], { type: 'audio/wav' })): FormData {
  const form = new FormData();
  form.set('audio', audio, 'utterance.wav');
  form.set('mode', mode);
  return form;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalRuntimeUrl === undefined) delete process.env.FINFINE_AGENT_RUNTIME_URL;
  else process.env.FINFINE_AGENT_RUNTIME_URL = originalRuntimeUrl;
});

test('transcription requires a bearer token and never contacts the runtime unauthenticated', async () => {
  let contacted = false;
  globalThis.fetch = async () => {
    contacted = true;
    throw new Error('unexpected runtime request');
  };
  const response = await TRANSCRIBE(new Request('http://localhost/api/voice/transcribe', {
    method: 'POST',
    body: voiceForm(),
  }));
  assert.equal(response.status, 401);
  assert.equal(contacted, false);
});

test('transcription forwards WAV and strict mode with the Cognito token', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  let forwardedAuthorization: string | null = null;
  let forwardedMode: FormDataEntryValue | null = null;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:8080/invocations/voice/transcribe');
    forwardedAuthorization = new Headers(init?.headers).get('authorization');
    forwardedMode = (init?.body as FormData).get('mode');
    return Response.json({ status: 'success', transcript: 'नमस्ते FinFine', detectedLanguages: ['hi-IN'] });
  };
  const response = await TRANSCRIBE(new Request('http://localhost/api/voice/transcribe', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-token' },
    body: voiceForm('hindi'),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(forwardedAuthorization, 'Bearer access-token');
  assert.equal(forwardedMode, 'hindi');
  assert.deepEqual(await response.json(), { status: 'success', transcript: 'नमस्ते FinFine', detectedLanguages: ['hi-IN'] });
});

test('transcription rejects bad MIME, modes, and oversized uploads before forwarding', async () => {
  let contacted = false;
  globalThis.fetch = async () => {
    contacted = true;
    throw new Error('unexpected runtime request');
  };
  const badMode = await TRANSCRIBE(new Request('http://localhost/api/voice/transcribe', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-token' },
    body: voiceForm('en-IN'),
  }));
  assert.equal(badMode.status, 400);

  const badMime = await TRANSCRIBE(new Request('http://localhost/api/voice/transcribe', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-token' },
    body: voiceForm('english', new Blob([new Uint8Array(64)], { type: 'audio/webm' })),
  }));
  assert.equal(badMime.status, 415);

  const largeAudio = await TRANSCRIBE(new Request('http://localhost/api/voice/transcribe', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-token' },
    body: voiceForm('english', new Blob([new Uint8Array(1_048_577)], { type: 'audio/wav' })),
  }));
  assert.equal(largeAudio.status, 413);

  const oversizedBody = await TRANSCRIBE(new Request('http://localhost/api/voice/transcribe', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-token' },
    body: voiceForm('english', new Blob([new Uint8Array(1_100_000)], { type: 'audio/wav' })),
  }));
  assert.equal(oversizedBody.status, 413);
  assert.equal(contacted, false);
});

test('synthesis accepts only authenticated session references and returns private audio', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080/invocations';
  let forwardedBody: unknown;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:8080/invocations/voice/synthesize');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer access-token');
    forwardedBody = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([0x49, 0x44, 0x33]), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  const response = await SYNTHESIZE(new Request('http://localhost/api/voice/synthesize', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID, requestId: REQUEST_ID, mode: 'hinglish', text: 'must not be forwarded' }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(forwardedBody, { sessionId: SESSION_ID, requestId: REQUEST_ID, mode: 'hinglish' });
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x49, 0x44, 0x33]);
});

test('synthesis rejects unauthenticated or malformed requests before forwarding', async () => {
  let contacted = false;
  globalThis.fetch = async () => {
    contacted = true;
    throw new Error('unexpected runtime request');
  };
  const unauthenticated = await SYNTHESIZE(new Request('http://localhost/api/voice/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID, requestId: REQUEST_ID, mode: 'english' }),
  }));
  assert.equal(unauthenticated.status, 401);
  const malformed = await SYNTHESIZE(new Request('http://localhost/api/voice/synthesize', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID, requestId: 'not-a-uuid', mode: 'en-IN' }),
  }));
  assert.equal(malformed.status, 400);
  assert.equal(contacted, false);
});
