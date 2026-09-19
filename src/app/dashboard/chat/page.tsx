'use client';

import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { ArrowUp, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, type ChatMessageData } from '@/components/prompt-kit/message';
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from '@/components/prompt-kit/prompt-input';
import { ThinkingBar } from '@/components/prompt-kit/thinking-bar';

const STORAGE_VERSION = 1;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_PROMPT_LENGTH = 4_000;
const TAB_KEY = 'finfine:chat:tab:v1';
const STORAGE_PREFIX = 'finfine:chat:v1';

const STARTER_PROMPTS = [
  'Will I have enough money to pay staff on the 10th?',
  'What happens if I delay Sharma Textiles by 5 days?',
  'How much GST do I owe on October 20th?',
  'Draft a WhatsApp message to collect from Royal Traders',
];

type PersistedChat = {
  version: number;
  userId: string;
  tabId: string;
  sessionId: string | null;
  messages: ChatMessageData[];
  updatedAt: number;
};

type ChatResponse = {
  status?: string;
  requestId?: string;
  sessionId?: string | null;
  answer?: string;
  code?: string;
  message?: string;
};

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getTabId(): string {
  try {
    const current = sessionStorage.getItem(TAB_KEY);
    if (current) return current;
    const next = randomUuid();
    sessionStorage.setItem(TAB_KEY, next);
    return next;
  } catch {
    return 'ephemeral';
  }
}

function storageKey(userId: string, tabId: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(tabId)}`;
}

function isMessage(value: unknown): value is ChatMessageData {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessageData>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    ['pending', 'complete', 'failed', 'cancelled'].includes(message.status ?? '') &&
    typeof message.createdAt === 'number'
  );
}

function normalizeMessages(messages: unknown): ChatMessageData[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(isMessage)
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      ...message,
      content: message.content.slice(0, MAX_MESSAGE_LENGTH),
      status: message.status === 'pending' ? 'cancelled' : message.status,
      ...(message.status === 'pending' ? { content: 'Request was interrupted before it completed.' } : {}),
    }));
}

function readPersistedChat(userId: string, tabId: string): { messages: ChatMessageData[]; sessionId: string | null } {
  try {
    const raw = sessionStorage.getItem(storageKey(userId, tabId));
    if (!raw) return { messages: [], sessionId: null };
    const parsed = JSON.parse(raw) as Partial<PersistedChat>;
    if (parsed.version !== STORAGE_VERSION || parsed.userId !== userId || parsed.tabId !== tabId) return { messages: [], sessionId: null };
    return { messages: normalizeMessages(parsed.messages), sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null };
  } catch {
    return { messages: [], sessionId: null };
  }
}

function persistChat(userId: string, tabId: string, messages: ChatMessageData[], sessionId: string | null) {
  try {
    const value: PersistedChat = {
      version: STORAGE_VERSION,
      userId,
      tabId,
      sessionId,
      messages: normalizeMessages(messages),
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(storageKey(userId, tabId), JSON.stringify(value));
  } catch {
    // Private browsing or storage quotas should not make the chat unusable.
  }
}

function errorMessageFor(response: ChatResponse, fallback: string) {
  if (response.code === 'SESSION_UNAVAILABLE') return 'This chat session is no longer available. Start a new chat to continue.';
  return response.message || fallback;
}

export default function ChatboxPage() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [draft, setDraft] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasConversation = messages.length > 0;
  const showStarters = !hasConversation;
  const latestAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages]);

  useEffect(() => {
    let cancelled = false;
    const currentTabId = getTabId();

    (async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        const currentUserId = user.userId;
        const restored = readPersistedChat(currentUserId, currentTabId);
        setUserId(currentUserId);
        setMessages(restored.messages);
        setSessionId(restored.sessionId);
      } catch {
        if (!cancelled) {
          setUserId(null);
          setMessages([]);
          setSessionId(null);
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isHydrated || !userId) return;
    persistChat(userId, getTabId(), messages, sessionId);
  }, [isHydrated, messages, sessionId, userId]);

  useEffect(() => {
    const handleSignOut = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) return;
      if (userId) {
        try { sessionStorage.removeItem(storageKey(userId, getTabId())); } catch { /* storage may be unavailable */ }
      }
      setMessages([]);
      setSessionId(null);
    };
    window.addEventListener('finfine:signout', handleSignOut);
    return () => window.removeEventListener('finfine:signout', handleSignOut);
  }, [userId]);

  const updateMessage = useCallback((messageId: string, update: Partial<ChatMessageData>) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...update } : message));
  }, []);

  const runRequest = useCallback(async (prompt: string, requestId: string, assistantId: string, requestSessionId: string | null) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeRequestIdRef.current = requestId;
    setIsPending(true);

    try {
      const authSession = await fetchAuthSession();
      const accessToken = authSession.tokens?.accessToken?.toString();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ prompt, requestId, ...(requestSessionId ? { sessionId: requestSessionId } : {}) }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as ChatResponse;

      if (activeRequestIdRef.current !== requestId) return;
      if (!response.ok || payload.status === 'error') {
        if (payload.code === 'SESSION_UNAVAILABLE') {
          setSessionId(null);
          setSessionUnavailable(true);
        }
        throw new Error(errorMessageFor(payload, 'FinFine could not complete that request.'));
      }
      if (!payload.answer) throw new Error('FinFine returned an empty response.');

      updateMessage(assistantId, { content: payload.answer, status: 'complete' });
      if (typeof payload.sessionId === 'string' && payload.sessionId) setSessionId(payload.sessionId);
      setSessionUnavailable(false);
    } catch (error) {
      if (activeRequestIdRef.current !== requestId) return;
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateMessage(assistantId, { content: 'Request cancelled.', status: 'cancelled' });
      } else {
        updateMessage(assistantId, { content: error instanceof Error ? error.message : 'FinFine could not complete that request.', status: 'failed' });
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        abortControllerRef.current = null;
        setIsPending(false);
      }
    }
  }, [updateMessage]);

  const sendMessage = useCallback(async (rawPrompt: string) => {
    const prompt = rawPrompt.trim().slice(0, MAX_PROMPT_LENGTH);
    if (!prompt || isPending || !isHydrated) return;
    setDraft('');
    setSessionUnavailable(false);

    const requestId = randomUuid();
    const assistantId = randomUuid();
    setMessages((current) => [
      ...current.slice(-(MAX_MESSAGES - 2)),
      { id: randomUuid(), role: 'user', content: prompt, status: 'complete', createdAt: Date.now(), requestId },
      { id: assistantId, role: 'assistant', content: '', status: 'pending', createdAt: Date.now(), requestId },
    ]);
    await runRequest(prompt, requestId, assistantId, sessionId);
  }, [isHydrated, isPending, runRequest, sessionId]);

  const retryMessage = useCallback((failedMessage: ChatMessageData) => {
    if (isPending) return;
    const failedIndex = messages.findIndex((message) => message.id === failedMessage.id);
    const source = failedIndex >= 0 ? [...messages.slice(0, failedIndex)].reverse().find((message) => message.role === 'user') : undefined;
    if (!source) return;
    // Reuse the original idempotency key. If the backend completed but the
    // response was lost, retrying must return that result instead of adding a
    // duplicate turn to the durable session.
    const requestId = failedMessage.requestId ?? randomUuid();
    updateMessage(failedMessage.id, { requestId, status: 'pending', content: '' });
    setSessionUnavailable(false);
    void runRequest(source.content, requestId, failedMessage.id, sessionId);
  }, [isPending, messages, runRequest, sessionId, updateMessage]);

  const stopRequest = () => {
    const activeRequestId = activeRequestIdRef.current;
    if (!activeRequestId) return;
    activeRequestIdRef.current = null;
    abortControllerRef.current?.abort();
    setIsPending(false);
    setMessages((current) => current.map((message) => message.requestId === activeRequestId && message.role === 'assistant'
      ? { ...message, content: 'Request cancelled.', status: 'cancelled' }
      : message));
  };

  const startNewChat = () => {
    stopRequest();
    if (userId) {
      try { sessionStorage.removeItem(storageKey(userId, getTabId())); } catch { /* storage may be unavailable */ }
    }
    setMessages([]);
    setSessionId(null);
    setSessionUnavailable(false);
    setDraft('');
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-5xl flex-col font-sans sm:min-h-[calc(100vh-5rem)]">
      <header className="flex items-center justify-between border-b border-neutral-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">FinFine Financial Assistant</h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">Online</span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">Ask about your cash, taxes, invoices, or vendor obligations.</p>
        </div>
        <button type="button" onClick={startNewChat} disabled={!hasConversation && !sessionId} className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Start a new chat">
          <Plus size={14} /> New chat
        </button>
      </header>

      <div className="flex flex-1 flex-col py-6">
        {showStarters ? (
          <div className="flex flex-1 flex-col items-center justify-center px-2 py-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-700 shadow-sm">
              <MessageSquare size={26} strokeWidth={1.7} />
            </div>
            <h2 className="font-display text-xl font-bold text-neutral-900">How can I help your business today?</h2>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-neutral-500">FinFine can use your verified financial records to answer practical questions. Ask in English, Hindi, or Hinglish.</p>
            <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} disabled={!isHydrated || isPending} className="group flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-3 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                  <span>{prompt}</span><Sparkles size={13} className="ml-2 shrink-0 text-neutral-400 transition group-hover:text-amber-500" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((message) => <ChatMessage key={message.id} message={message} onRetry={retryMessage} />)}
          </div>
        )}

        <div className="mt-auto pt-6">
          {sessionUnavailable && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900" role="alert">
              <span>This session expired. Your visible transcript is kept, but a new session is required.</span>
              <button type="button" onClick={startNewChat} className="shrink-0 font-semibold underline underline-offset-2">Start a new chat</button>
            </div>
          )}
          {isPending && <ThinkingBar onStop={stopRequest} />}
          <PromptInput value={draft} onValueChange={setDraft} onSubmit={() => void sendMessage(draft)} disabled={!isHydrated || isPending}>
            <PromptInputTextarea placeholder="Ask about your cash, taxes, invoices, or obligations…" maxLength={MAX_PROMPT_LENGTH} />
            <PromptInputActions className="justify-end">
              <PromptInputAction tooltip="Send message">
                <button type="button" onClick={() => void sendMessage(draft)} disabled={!isHydrated || isPending || !draft.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400" aria-label="Send message">
                  <ArrowUp size={17} strokeWidth={2.2} />
                </button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
          {latestAssistant?.status === 'complete' && <p className="mt-2 text-center text-[10px] text-neutral-400">FinFine answers are based on the records available to your workspace.</p>}
        </div>
      </div>
    </div>
  );
}
