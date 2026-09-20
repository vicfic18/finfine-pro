import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { GET as GET_HISTORY, POST } from '../src/app/api/chat/route';
import { DELETE as DELETE_CONVERSATION, GET as GET_CONVERSATION } from '../src/app/api/chat/[sessionId]/route';

const REQUEST_ID = '315b4a4e-d5f8-4b21-911c-37bb629e869d';
const SESSION_ID = '557dbe23-8e61-41f4-8e42-3925b0eb945e';
const originalFetch = globalThis.fetch;
const originalRuntimeUrl = process.env.FINFINE_AGENT_RUNTIME_URL;
const originalTimeout = process.env.FINFINE_CHAT_PROXY_TIMEOUT_MS;

function chatRequest(
  body: unknown,
  authorization = 'Bearer access-token',
): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

function historyRequest(path = '/api/chat', method = 'GET', authorization = 'Bearer access-token'): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: authorization ? { Authorization: authorization } : {},
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalRuntimeUrl === undefined) delete process.env.FINFINE_AGENT_RUNTIME_URL;
  else process.env.FINFINE_AGENT_RUNTIME_URL = originalRuntimeUrl;
  if (originalTimeout === undefined) delete process.env.FINFINE_CHAT_PROXY_TIMEOUT_MS;
  else process.env.FINFINE_CHAT_PROXY_TIMEOUT_MS = originalTimeout;
});

test('rejects invalid input before contacting the runtime', async () => {
  let contacted = false;
  globalThis.fetch = async () => {
    contacted = true;
    throw new Error('unexpected request');
  };

  const response = await POST(chatRequest({ prompt: '   ', requestId: REQUEST_ID }));

  assert.equal(response.status, 400);
  assert.equal(contacted, false);
  assert.equal((await response.json()).code, 'invalid_prompt');
});

test('requires and forwards the Cognito bearer token', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  let forwardedAuthorization: string | null = null;
  let forwardedBody: unknown;
  globalThis.fetch = async (input, init) => {
    forwardedAuthorization = new Headers(init?.headers).get('authorization');
    forwardedBody = JSON.parse(String(init?.body));
    assert.equal(String(input), 'http://127.0.0.1:8080/invocations');
    return Response.json({
      status: 'success',
      requestId: REQUEST_ID,
      sessionId: SESSION_ID,
      answer: 'Available balance is ...',
    });
  };

  const missing = await POST(chatRequest({ prompt: 'Balance?', requestId: REQUEST_ID }, ''));
  assert.equal(missing.status, 401);

  const response = await POST(chatRequest({ prompt: '  Balance?  ', requestId: REQUEST_ID }));
  assert.equal(response.status, 200);
  assert.equal(forwardedAuthorization, 'Bearer access-token');
  assert.deepEqual(forwardedBody, { prompt: 'Balance?', requestId: REQUEST_ID });
  assert.deepEqual(await response.json(), {
    status: 'success',
    requestId: REQUEST_ID,
    sessionId: SESSION_ID,
    answer: 'Available balance is ...',
  });
});

test('forwards an optional speech mode as model guidance', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  let forwardedBody: unknown;
  globalThis.fetch = async (_input, init) => {
    forwardedBody = JSON.parse(String(init?.body));
    return Response.json({
      status: 'success',
      requestId: REQUEST_ID,
      sessionId: SESSION_ID,
      answer: 'आपका बैलेंस ...',
    });
  };

  const response = await POST(chatRequest({ prompt: 'Balance?', requestId: REQUEST_ID, speechMode: 'hindi' }));

  assert.equal(response.status, 200);
  assert.deepEqual(forwardedBody, { prompt: 'Balance?', requestId: REQUEST_ID, speechMode: 'hindi' });
});

test('rejects unsupported speech modes before contacting the runtime', async () => {
  let contacted = false;
  globalThis.fetch = async () => {
    contacted = true;
    throw new Error('unexpected request');
  };
  const response = await POST(chatRequest({ prompt: 'Balance?', requestId: REQUEST_ID, speechMode: 'en-IN' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'invalid_speech_mode');
  assert.equal(contacted, false);
});

test('streams NDJSON from the local runtime without buffering', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:8080/invocations/stream');
    assert.equal(new Headers(init?.headers).get('accept'), 'application/x-ndjson');
    return new Response([
      JSON.stringify({ type: 'start', requestId: REQUEST_ID, sessionId: SESSION_ID }),
      JSON.stringify({ type: 'text_delta', delta: 'Hello' }),
      JSON.stringify({ type: 'done', requestId: REQUEST_ID, sessionId: SESSION_ID, answer: 'Hello' }),
      '',
    ].join('\n'), { headers: { 'Content-Type': 'application/x-ndjson' } });
  };

  const response = await POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify({ prompt: 'Balance?', requestId: REQUEST_ID }),
  }));

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/x-ndjson/);
  assert.match(await response.text(), /"type":"done"/);
});

test('times out the upstream request with a safe error', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  process.env.FINFINE_CHAT_PROXY_TIMEOUT_MS = '1';
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });

  const response = await POST(chatRequest({ prompt: 'Balance?', requestId: REQUEST_ID }));

  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), {
    status: 'error',
    requestId: REQUEST_ID,
    code: 'runtime_timeout',
    message: 'The agent took too long to respond.',
  });
});

test('sanitizes arbitrary upstream failures', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  globalThis.fetch = async () => Response.json(
    { status: 'error', requestId: REQUEST_ID, code: 'INTERNAL', message: 'secret record contents' },
    { status: 500 },
  );

  const response = await POST(chatRequest({ prompt: 'Balance?', requestId: REQUEST_ID }));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.code, 'runtime_error');
  assert.equal(JSON.stringify(body).includes('secret record contents'), false);
});

test('preserves only the safe session-unavailable recovery signal', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  globalThis.fetch = async () => Response.json(
    {
      status: 'error',
      requestId: REQUEST_ID,
      code: 'SESSION_UNAVAILABLE',
      message: 'internal storage detail',
    },
    { status: 409 },
  );

  const response = await POST(chatRequest({
    prompt: 'Continue',
    requestId: REQUEST_ID,
    sessionId: SESSION_ID,
  }));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    status: 'error',
    requestId: REQUEST_ID,
    code: 'SESSION_UNAVAILABLE',
    message: 'This chat session is no longer available. Start a new chat to continue.',
  });
});

test('lists conversations through the authenticated no-store proxy', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:8080/invocations/conversations');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer access-token');
    return Response.json({
      status: 'success',
      conversations: [{
        sessionId: SESSION_ID,
        title: 'Will I have enough money?',
        createdAt: '2026-09-19T10:00:00Z',
        updatedAt: '2026-09-19T10:01:00Z',
      }],
    });
  };

  const response = await GET_HISTORY(historyRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).conversations[0].sessionId, SESSION_ID);
});

test('loads and deletes one conversation with strict UUID routing', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080/invocations';
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method}:${String(input)}`);
    if (init?.method === 'DELETE') return Response.json({ status: 'success' });
    return Response.json({
      status: 'success',
      conversation: {
        sessionId: SESSION_ID,
        title: 'Balance question',
        createdAt: '2026-09-19T10:00:00Z',
        updatedAt: '2026-09-19T10:01:00Z',
        messages: [{
          id: `user:${REQUEST_ID}`,
          role: 'user',
          content: 'Balance?',
          status: 'complete',
          createdAt: '2026-09-19T10:00:00Z',
          requestId: REQUEST_ID,
        }],
      },
    });
  };
  const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

  const getResponse = await GET_CONVERSATION(historyRequest(`/api/chat/${SESSION_ID}`), context);
  const deleteResponse = await DELETE_CONVERSATION(historyRequest(`/api/chat/${SESSION_ID}`, 'DELETE'), context);
  const invalidResponse = await GET_CONVERSATION(historyRequest('/api/chat/not-a-uuid'), { params: Promise.resolve({ sessionId: 'not-a-uuid' }) });

  assert.equal(getResponse.status, 200);
  assert.equal(deleteResponse.status, 200);
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(calls, [
    `GET:http://127.0.0.1:8080/invocations/conversations/${SESSION_ID}`,
    `DELETE:http://127.0.0.1:8080/invocations/conversations/${SESSION_ID}`,
  ]);
});

test('history proxy rejects malformed runtime transcripts', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  globalThis.fetch = async () => Response.json({
    status: 'success',
    conversation: {
      sessionId: SESSION_ID,
      title: 'Unsafe',
      createdAt: '2026-09-19T10:00:00Z',
      updatedAt: '2026-09-19T10:01:00Z',
      messages: [{ role: 'tool', content: 'private tool output' }],
    },
  });

  const response = await GET_CONVERSATION(
    historyRequest(`/api/chat/${SESSION_ID}`),
    { params: Promise.resolve({ sessionId: SESSION_ID }) },
  );
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(JSON.stringify(body).includes('private tool output'), false);
});

test('history proxy maps expired sessions to a safe not-found response', async () => {
  process.env.FINFINE_AGENT_RUNTIME_URL = 'http://127.0.0.1:8080';
  globalThis.fetch = async () => Response.json(
    { status: 'error', code: 'SESSION_UNAVAILABLE', message: 'private storage detail' },
    { status: 409 },
  );

  const response = await GET_CONVERSATION(
    historyRequest(`/api/chat/${SESSION_ID}`),
    { params: Promise.resolve({ sessionId: SESSION_ID }) },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    status: 'error',
    requestId: null,
    code: 'conversation_not_found',
    message: 'This conversation is no longer available.',
  });
});
