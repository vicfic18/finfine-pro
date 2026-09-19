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

export type ConversationSummary = {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete';
  createdAt: string;
  requestId: string;
};

export type ConversationListResponse = {
  status: 'success';
  conversations: ConversationSummary[];
};

export type ConversationResponse = {
  status: 'success';
  conversation: ConversationSummary & { messages: ConversationMessage[] };
};

export type ConversationDeleteResponse = {
  status: 'success';
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

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isConversationSummary(value: unknown): value is ConversationSummary {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    isUuid(value.sessionId) &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  );
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.content === 'string' &&
    value.status === 'complete' &&
    isIsoDate(value.createdAt) &&
    typeof value.requestId === 'string' &&
    isUuid(value.requestId)
  );
}

export function isConversationListResponse(value: unknown): value is ConversationListResponse {
  return (
    isRecord(value) &&
    value.status === 'success' &&
    Array.isArray(value.conversations) &&
    value.conversations.every(isConversationSummary)
  );
}

export function isConversationResponse(value: unknown): value is ConversationResponse {
  if (!isRecord(value) || value.status !== 'success' || !isRecord(value.conversation)) return false;
  const messages = value.conversation.messages;
  return (
    isConversationSummary(value.conversation) &&
    Array.isArray(messages) &&
    messages.every(isConversationMessage)
  );
}

export function isConversationDeleteResponse(value: unknown): value is ConversationDeleteResponse {
  return isRecord(value) && value.status === 'success';
}
