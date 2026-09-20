import { isSpeechMode, type SpeechMode } from '@/lib/voice-contract';

export const MAX_CHAT_PROMPT_LENGTH = 4_000;
export const MAX_CHAT_ID_LENGTH = 64;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatRequest = {
  prompt: string;
  requestId: string;
  sessionId?: string;
  speechMode?: SpeechMode;
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

export type ChatStreamStep = {
  id: string;
  kind: 'tool' | 'code';
  title: string;
  status: 'running' | 'complete' | 'error';
};

export type ChatStreamEvent =
  | { type: 'start'; requestId: string; sessionId: string }
  | { type: 'step'; step: ChatStreamStep }
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; requestId: string; sessionId: string; answer: string }
  | { type: 'error'; requestId: string; code: string; message: string };

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
  steps?: ChatStreamStep[];
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

  let speechMode: SpeechMode | undefined;
  if (value.speechMode !== undefined) {
    if (!isSpeechMode(value.speechMode)) {
      return {
        ok: false,
        code: 'invalid_speech_mode',
        message: 'speechMode must be english, hindi, or hinglish.',
        requestId,
      };
    }
    speechMode = value.speechMode;
  }

  return { ok: true, value: { prompt, requestId, sessionId, speechMode } };
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

export function isChatStreamStep(value: unknown): value is ChatStreamStep {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 256 &&
    (value.kind === 'tool' || value.kind === 'code') &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    value.title.length <= 160 &&
    (value.status === 'running' || value.status === 'complete' || value.status === 'error')
  );
}

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'start') return typeof value.requestId === 'string' && isUuid(value.requestId) && typeof value.sessionId === 'string' && isUuid(value.sessionId);
  if (value.type === 'text_delta') return typeof value.delta === 'string';
  if (value.type === 'done') return typeof value.requestId === 'string' && isUuid(value.requestId) && typeof value.sessionId === 'string' && isUuid(value.sessionId) && typeof value.answer === 'string';
  if (value.type === 'error') return typeof value.requestId === 'string' && isUuid(value.requestId) && typeof value.code === 'string' && typeof value.message === 'string';
  if (value.type === 'step') {
    return isChatStreamStep(value.step);
  }
  return false;
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
    isUuid(value.requestId) &&
    (value.steps === undefined || (Array.isArray(value.steps) && value.steps.every(isChatStreamStep)))
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
