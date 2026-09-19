export const MAX_CHAT_PROMPT_LENGTH = 4_000;
export const MAX_CHAT_ID_LENGTH = 64;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatRequest = {
  prompt: string;
  requestId: string;
  sessionId?: string;
};

export type ChatSuccessResponse = {
  status: 'success';
  requestId: string;
  sessionId: string;
  answer: string;
};

export type ChatErrorResponse = {
  status: 'error';
  requestId: string | null;
  code: string;
  message: string;
};

export function isUuid(value: string): boolean {
  return value.length <= MAX_CHAT_ID_LENGTH && UUID_PATTERN.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseChatRequest(value: unknown):
  | { ok: true; value: ChatRequest }
  | { ok: false; code: string; message: string; requestId: string | null } {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Request body must be a JSON object.',
      requestId: null,
    };
  }

  const requestId = typeof value.requestId === 'string' ? value.requestId.trim() : null;
  if (!requestId || !isUuid(requestId)) {
    return {
      ok: false,
      code: 'invalid_request_id',
      message: 'requestId must be a valid UUID.',
      requestId: null,
    };
  }

  if (typeof value.prompt !== 'string') {
    return {
      ok: false,
      code: 'invalid_prompt',
      message: 'prompt must be a string.',
      requestId,
    };
  }

  const prompt = value.prompt.trim();
  if (prompt.length === 0 || prompt.length > MAX_CHAT_PROMPT_LENGTH) {
    return {
      ok: false,
      code: 'invalid_prompt',
      message: `prompt must contain between 1 and ${MAX_CHAT_PROMPT_LENGTH} characters.`,
      requestId,
    };
  }

  let sessionId: string | undefined;
  if (value.sessionId !== undefined &&
      (typeof value.sessionId !== 'string' || !isUuid(value.sessionId.trim()))) {
    return {
      ok: false,
      code: 'invalid_session_id',
      message: 'sessionId must be a valid UUID when provided.',
      requestId,
    };
  } else if (typeof value.sessionId === 'string') {
    sessionId = value.sessionId.trim();
  }

  return { ok: true, value: { prompt, requestId, sessionId } };
}

export function isChatSuccessResponse(value: unknown): value is ChatSuccessResponse {
  return (
    isRecord(value) &&
    value.status === 'success' &&
    typeof value.requestId === 'string' &&
    isUuid(value.requestId) &&
    typeof value.sessionId === 'string' &&
    isUuid(value.sessionId) &&
    typeof value.answer === 'string'
  );
}
