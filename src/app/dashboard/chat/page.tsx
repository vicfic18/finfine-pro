'use client';

import { fetchAuthSession } from 'aws-amplify/auth';
import { ArrowUp, LoaderCircle, MessageSquare, Mic, PanelLeft, Play, Plus, Sparkles, Square, Trash2, Volume2, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessage, type ChatMessageData } from '@/components/prompt-kit/message';
import type { ChainOfThoughtStepData } from '@/components/prompt-kit/chain-of-thought';
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from '@/components/prompt-kit/prompt-input';
import { ThinkingBar } from '@/components/prompt-kit/thinking-bar';
import { isChatStreamEvent, isUuid, type ChatStreamEvent, type ConversationListResponse, type ConversationResponse, type ConversationSummary } from '@/lib/chat-contract';
import { startVoiceCapture, type VoiceCapture } from '@/lib/voice-capture';
import { isSpeechMode, SPEECH_MODES, type SpeechMode } from '@/lib/voice-contract';

const MAX_MESSAGES = 100;
const MAX_PROMPT_LENGTH = 4_000;

type ChatResponse = {
  status?: string;
  requestId?: string;
  sessionId?: string | null;
  answer?: string;
  code?: string;
  message?: string;
};

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'processing' | 'speaking';
type VoiceTranscriptionResponse = {
  status?: string;
  transcript?: string;
  code?: string;
  message?: string;
};

const SPEECH_MODE_STORAGE_KEY = 'finfine-speech-mode';

async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const authSession = await fetchAuthSession();
  const accessToken = authSession.tokens?.accessToken?.toString();
  return fetch(input, {
    ...init,
    cache: 'no-store',
    headers: { ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  });
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function errorMessageFor(response: ChatResponse, fallback: string) {
  if (response.code === 'SESSION_UNAVAILABLE' || response.code === 'conversation_not_found') return 'This conversation is no longer available.';
  return response.message || fallback;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

async function* readNdjson(response: Response): AsyncGenerator<ChatStreamEvent> {
  if (!response.body) throw new Error('FinFine returned an empty response.');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += value ?? '';
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event: unknown = JSON.parse(line);
        if (!isChatStreamEvent(event)) throw new Error('FinFine returned an invalid streaming event.');
        yield event;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const event: unknown = JSON.parse(buffer);
      if (!isChatStreamEvent(event)) throw new Error('FinFine returned an invalid streaming event.');
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function HistoryList({ conversations, selectedId, deletingId, loading, onOpen, onDelete, onNew, onClose }: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  deletingId: string | null;
  loading: boolean;
  onOpen: (sessionId: string) => void;
  onDelete: (conversation: ConversationSummary) => void;
  onNew: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-3">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">{t('chat.chats')}</span>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900" aria-label={t('chat.closeHistory')}><X size={17} /></button>
        )}
      </div>
      <div className="p-3">
        <button type="button" onClick={onNew} className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-700"><Plus size={15} /> {t('chat.newChat')}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 custom-scrollbar">
        {loading ? (
          <p className="px-2 py-4 text-xs text-neutral-400">{t('chat.loadingConversations')}</p>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-4 text-xs leading-5 text-neutral-400">{t('chat.emptyHistory')}</p>
        ) : conversations.map((conversation) => {
          const selected = conversation.sessionId === selectedId;
          return (
            <div key={conversation.sessionId} className={`group mb-1 flex items-center rounded-xl ${selected ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white'}`}>
              <button type="button" onClick={() => onOpen(conversation.sessionId)} className="min-w-0 flex-1 px-3 py-2.5 text-left" aria-current={selected ? 'page' : undefined}>
                <span className="block truncate text-xs font-semibold text-neutral-800">{conversation.title}</span>
                <span className="mt-0.5 block text-[10px] text-neutral-400">{formatUpdatedAt(conversation.updatedAt)}</span>
              </button>
              <button type="button" onClick={() => onDelete(conversation)} disabled={deletingId === conversation.sessionId} className="mr-1 rounded-lg p-2 text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:opacity-40" aria-label={`Delete ${conversation.title}`}><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function saveStepsToSessionStorage(key: string, steps: ChainOfThoughtStepData[]) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(`ff_cot_${key}`, JSON.stringify(steps));
    }
  } catch {
    // Ignore storage quota or security errors
  }
}

function getStepsFromSessionStorage(key: string): ChainOfThoughtStepData[] | undefined {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const data = window.sessionStorage.getItem(`ff_cot_${key}`);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed as ChainOfThoughtStepData[];
      }
    }
  } catch {
    // Ignore parse errors
  }
  return undefined;
}

function ChatboxContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawConversationId = searchParams.get('conversation');
  const selectedConversationId = rawConversationId && isUuid(rawConversationId) ? rawConversationId : null;
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [draft, setDraft] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(selectedConversationId);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isConversationLoading, setIsConversationLoading] = useState(Boolean(selectedConversationId));
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [speechMode, setSpeechMode] = useState<SpeechMode>('english');
  const [speechPreferenceLoaded, setSpeechPreferenceLoaded] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [draftFromVoice, setDraftFromVoice] = useState(false);
  const [speechBusyRequestId, setSpeechBusyRequestId] = useState<string | null>(null);
  const [speechReadyIds, setSpeechReadyIds] = useState<Set<string>>(new Set());
  const [speechFailedIds, setSpeechFailedIds] = useState<Set<string>>(new Set());
  const [activeAudioRequestId, setActiveAudioRequestId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const captureRef = useRef<VoiceCapture | null>(null);
  const captureGenerationRef = useRef(0);
  const captureModeRef = useRef<SpeechMode>('english');
  const finishRecordingRef = useRef<(generation: number) => Promise<void>>(async () => undefined);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechAbortControllerRef = useRef<AbortController | null>(null);
  const transcriptionAbortControllerRef = useRef<AbortController | null>(null);
  const audioUrlsRef = useRef<Map<string, string>>(new Map());
  const requestModesRef = useRef<Map<string, SpeechMode>>(new Map());
  const voiceRequestIdsRef = useRef<Set<string>>(new Set());

  const stopPlayback = useCallback(() => {
    speechAbortControllerRef.current?.abort();
    speechAbortControllerRef.current = null;
    const audio = playbackAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
    }
    setActiveAudioRequestId(null);
    setVoiceState((current) => current === 'speaking' ? 'idle' : current);
  }, []);

  const cancelRecording = useCallback(() => {
    captureGenerationRef.current += 1;
    transcriptionAbortControllerRef.current?.abort();
    transcriptionAbortControllerRef.current = null;
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) void capture.cancel();
    setVoiceState((current) => current === 'recording' || current === 'transcribing' ? 'idle' : current);
  }, []);

  const synthesizeSpeech = useCallback(async (
    requestSessionId: string,
    requestId: string,
    mode: SpeechMode,
    autoplay: boolean,
  ) => {
    stopPlayback();
    setSpeechBusyRequestId(requestId);
    setVoiceError(null);
    setVoiceState('processing');
    let url = audioUrlsRef.current.get(requestId);
    let activeController: AbortController | null = null;
    try {
      if (!url) {
        const controller = new AbortController();
        activeController = controller;
        speechAbortControllerRef.current = controller;
        const response = await authenticatedFetch('/api/voice/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: requestSessionId, requestId, mode }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({})) as ChatResponse;
          throw new Error(error.message || 'Could not generate speech. You can retry playback.');
        }
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        audioUrlsRef.current.set(requestId, url);
        setSpeechReadyIds((current) => new Set(current).add(requestId));
        setSpeechFailedIds((current) => {
          const next = new Set(current);
          next.delete(requestId);
          return next;
        });
      }
      if (!autoplay) {
        setVoiceState('idle');
        return;
      }
      const audio = new Audio(url);
      playbackAudioRef.current = audio;
      audio.onplay = () => {
        setActiveAudioRequestId(requestId);
        setVoiceState('speaking');
      };
      audio.onended = () => {
        setActiveAudioRequestId(null);
        setVoiceState((current) => current === 'speaking' ? 'idle' : current);
      };
      audio.onerror = () => {
        setActiveAudioRequestId(null);
        setVoiceState((current) => current === 'speaking' ? 'idle' : current);
      };
      try {
        await audio.play();
      } catch {
        // The reply remains visible and the play control below is available if autoplay is blocked.
        setActiveAudioRequestId(null);
        setVoiceState('idle');
      }
    } catch (error) {
      const wasAborted = error instanceof DOMException && error.name === 'AbortError';
      if (!wasAborted) {
        setSpeechFailedIds((current) => new Set(current).add(requestId));
        setVoiceError(error instanceof Error ? error.message : 'Could not generate speech. You can retry playback.');
        setVoiceState('idle');
      }
    } finally {
      if (activeController && speechAbortControllerRef.current === activeController) speechAbortControllerRef.current = null;
      setSpeechBusyRequestId((current) => current === requestId ? null : current);
    }
  }, [stopPlayback]);

  const finishRecording = useCallback(async (generation: number) => {
    if (generation !== captureGenerationRef.current) return;
    const capture = captureRef.current;
    if (!capture) return;
    captureRef.current = null;
    captureGenerationRef.current += 1;
    const selectedMode = captureModeRef.current;
    setVoiceState('transcribing');
    setVoiceError(null);
    const controller = new AbortController();
    transcriptionAbortControllerRef.current = controller;
    try {
      const audio = await capture.stop();
      if (captureGenerationRef.current !== generation + 1 || controller.signal.aborted) return;
      const form = new FormData();
      form.set('audio', audio, 'utterance.wav');
      form.set('mode', selectedMode);
      const response = await authenticatedFetch('/api/voice/transcribe', { method: 'POST', body: form, signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as VoiceTranscriptionResponse;
      if (controller.signal.aborted) return;
      if (!response.ok || payload.status !== 'success' || typeof payload.transcript !== 'string' || !payload.transcript.trim()) {
        throw new Error(payload.message || 'Could not transcribe the recording. Please try again.');
      }
      setDraft(payload.transcript.slice(0, MAX_PROMPT_LENGTH));
      setDraftFromVoice(true);
      setVoiceState('idle');
    } catch (error) {
      if (controller.signal.aborted) return;
      setVoiceState('idle');
      setVoiceError(error instanceof Error ? error.message : 'Could not transcribe the recording. Please try again.');
    } finally {
      if (transcriptionAbortControllerRef.current === controller) transcriptionAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    finishRecordingRef.current = finishRecording;
  }, [finishRecording]);

  const startRecording = useCallback(async () => {
    stopPlayback();
    setVoiceError(null);
    const generation = ++captureGenerationRef.current;
    captureModeRef.current = speechMode;
    setVoiceState('recording');
    try {
      const capture = await startVoiceCapture(() => {
        window.setTimeout(() => { void finishRecordingRef.current(generation); }, 0);
      });
      if (generation !== captureGenerationRef.current) {
        await capture.cancel();
        return;
      }
      captureRef.current = capture;
    } catch (error) {
      if (generation !== captureGenerationRef.current) return;
      setVoiceState('idle');
      const name = error instanceof DOMException ? error.name : '';
      setVoiceError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Microphone access is blocked. Allow microphone permission in your browser, or keep typing.'
        : error instanceof Error ? error.message : 'Could not start the microphone. You can still type your message.');
    }
  }, [speechMode, stopPlayback]);

  const stopRecording = useCallback(() => {
    const generation = captureGenerationRef.current;
    if (captureRef.current) {
      void finishRecording(generation);
    } else {
      captureGenerationRef.current += 1;
      setVoiceState('idle');
    }
  }, [finishRecording]);

  const starterPrompts = [
    t('chat.starter1', 'How many days of cash runway do I currently have?'),
    t('chat.starter2', 'What are my upcoming GST, TDS, and statutory deadlines?'),
    t('chat.starter3', 'How will festive sales surge impact my working capital?'),
    t('chat.starter4', 'How can I optimize debtor collection velocity and DSO?'),
  ];

  const hasConversation = messages.length > 0;
  const showStarters = !hasConversation && !isConversationLoading;
  const latestAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages]);

  const refreshHistory = useCallback(async (signal?: AbortSignal) => {
    const response = await authenticatedFetch('/api/chat', { method: 'GET', signal });
    const payload = await response.json().catch(() => ({})) as ConversationListResponse & ChatResponse;
    if (!response.ok || payload.status !== 'success' || !Array.isArray(payload.conversations)) throw new Error(errorMessageFor(payload, 'Could not load conversation history.'));
    setConversations(payload.conversations);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SPEECH_MODE_STORAGE_KEY);
      // Loading this browser-only preference after hydration intentionally updates UI state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isSpeechMode(saved)) setSpeechMode(saved);
    } catch {
      // Browser storage may be disabled; speech mode still works for this visit.
    } finally {
      setSpeechPreferenceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!speechPreferenceLoaded) return;
    try {
      window.localStorage.setItem(SPEECH_MODE_STORAGE_KEY, speechMode);
    } catch {
      // Browser storage may be disabled; keep the in-memory selection.
    }
  }, [speechMode, speechPreferenceLoaded]);

  useEffect(() => () => {
    speechAbortControllerRef.current?.abort();
    transcriptionAbortControllerRef.current?.abort();
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) void capture.cancel();
    const audio = playbackAudioRef.current;
    if (audio) audio.pause();
    for (const url of audioUrlsRef.current.values()) URL.revokeObjectURL(url);
    audioUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const handleSignOut = () => {
      cancelRecording();
      stopPlayback();
    };
    window.addEventListener('finfine:signout', handleSignOut);
    return () => window.removeEventListener('finfine:signout', handleSignOut);
  }, [cancelRecording, stopPlayback]);

  useEffect(() => {
    if (rawConversationId && !selectedConversationId) {
      // Route changes must synchronously stop media before navigation continues.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cancelRecording();
      stopPlayback();
      router.replace('/dashboard/chat', { scroll: false });
      return;
    }

    if (selectedConversationId && selectedConversationId === activeSessionIdRef.current) {
      return;
    }

    cancelRecording();
    stopPlayback();
    for (const url of audioUrlsRef.current.values()) URL.revokeObjectURL(url);
    audioUrlsRef.current.clear();
    requestModesRef.current.clear();
    voiceRequestIdsRef.current.clear();
    setSpeechReadyIds(new Set());
    setSpeechFailedIds(new Set());
    setSpeechBusyRequestId(null);

    const controller = new AbortController();

    (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoadError(null);
      setSessionUnavailable(false);
      setIsHistoryLoading(true);
      setIsConversationLoading(Boolean(selectedConversationId));
      setMessages([]);
      setSessionId(selectedConversationId);
      activeSessionIdRef.current = selectedConversationId;
      try {
        await refreshHistory(controller.signal);
        if (selectedConversationId) {
          const response = await authenticatedFetch(`/api/chat/${encodeURIComponent(selectedConversationId)}`, { method: 'GET', signal: controller.signal });
          const payload = await response.json().catch(() => ({})) as ConversationResponse & ChatResponse;
          if (!response.ok || payload.status !== 'success' || !payload.conversation) {
            if (response.status === 404 || response.status === 409) setSessionUnavailable(true);
            throw new Error(errorMessageFor(payload, 'Could not load this conversation.'));
          }
          setSessionId(payload.conversation.sessionId);
          activeSessionIdRef.current = payload.conversation.sessionId;
          setMessages(payload.conversation.messages.slice(-MAX_MESSAGES).map((message) => {
            const cachedSteps = getStepsFromSessionStorage(message.id) || getStepsFromSessionStorage(message.requestId);
            return {
              id: message.id,
              role: message.role,
              content: message.content,
              status: 'complete',
              createdAt: Date.parse(message.createdAt),
              requestId: message.requestId,
              steps: message.steps ?? cachedSteps,
            };
          }));
        } else {
          setSessionId(null);
          activeSessionIdRef.current = null;
          setMessages([]);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'Could not load conversations.');
      } finally {
        if (!controller.signal.aborted) {
          setIsHistoryLoading(false);
          setIsConversationLoading(false);
          setIsHydrated(true);
        }
      }
    })();
    return () => controller.abort();
  }, [cancelRecording, rawConversationId, refreshHistory, router, selectedConversationId, stopPlayback]);

  const updateMessage = useCallback((messageId: string, update: Partial<ChatMessageData>) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...update } : message));
  }, []);

  const runRequest = useCallback(async (
    prompt: string,
    requestId: string,
    assistantId: string,
    requestSessionId: string | null,
    requestSpeechMode: SpeechMode,
    speakResponse: boolean,
  ) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeRequestIdRef.current = requestId;
    setIsPending(true);
    try {
      const response = await authenticatedFetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ prompt, requestId, ...(speakResponse ? { speechMode: requestSpeechMode } : {}), ...(requestSessionId ? { sessionId: requestSessionId } : {}) }), signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as ChatResponse;
        if (payload.code === 'SESSION_UNAVAILABLE') {
          setSessionId(null);
          setSessionUnavailable(true);
        }
        throw new Error(errorMessageFor(payload, 'FinFine could not complete that request.'));
      }
      let completedSessionId: string | null = null;
      let completedAnswer: string | null = null;
      let streamedAnswer = '';
      for await (const event of readNdjson(response)) {
        if (activeRequestIdRef.current !== requestId) return;
        if (event.type === 'step') {
          setMessages((current) => current.map((message) => {
            if (message.id !== assistantId) return message;
            const steps = [...(message.steps ?? [])];
            const index = steps.findIndex((step) => step.id === event.step.id);
            if (index >= 0) steps[index] = event.step;
            else steps.push(event.step);
            saveStepsToSessionStorage(assistantId, steps);
            saveStepsToSessionStorage(requestId, steps);
            return { ...message, steps };
          }));
        } else if (event.type === 'text_delta') {
          streamedAnswer += event.delta;
          updateMessage(assistantId, { content: streamedAnswer, status: 'complete' });
        } else if (event.type === 'done') {
          completedSessionId = event.sessionId;
          completedAnswer = event.answer;
        } else if (event.type === 'error') {
          if (event.code === 'SESSION_UNAVAILABLE') {
            setSessionId(null);
            setSessionUnavailable(true);
          }
          throw new Error(errorMessageFor(event, 'FinFine could not complete that request.'));
        }
      }
      if (activeRequestIdRef.current !== requestId) return;
      if (!completedAnswer || !completedSessionId) throw new Error('FinFine returned an incomplete response.');
      updateMessage(assistantId, { content: completedAnswer, status: 'complete' });
      activeSessionIdRef.current = completedSessionId;
      setSessionId(completedSessionId);
      setSessionUnavailable(false);
      if (!requestSessionId && typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/dashboard/chat?conversation=${encodeURIComponent(completedSessionId)}`);
      }
      await refreshHistory().catch(() => undefined);
      if (speakResponse) await synthesizeSpeech(completedSessionId, requestId, requestSpeechMode, true);
    } catch (error) {
      if (activeRequestIdRef.current !== requestId) return;
      if (error instanceof DOMException && error.name === 'AbortError') updateMessage(assistantId, { content: 'Request cancelled.', status: 'cancelled' });
      else updateMessage(assistantId, { content: error instanceof Error ? error.message : 'FinFine could not complete that request.', status: 'failed' });
      if (speakResponse) setVoiceState('idle');
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        abortControllerRef.current = null;
        setIsPending(false);
      }
    }
  }, [refreshHistory, synthesizeSpeech, updateMessage]);

  const sendMessage = useCallback(async (rawPrompt: string, speakResponse = false) => {
    const prompt = rawPrompt.trim().slice(0, MAX_PROMPT_LENGTH);
    if (!prompt || isPending || !isHydrated || voiceState === 'recording' || voiceState === 'transcribing') return;
    stopPlayback();
    setDraft('');
    setDraftFromVoice(false);
    setVoiceError(null);
    setSessionUnavailable(false);
    const requestId = randomUuid();
    const assistantId = randomUuid();
    requestModesRef.current.set(requestId, speechMode);
    if (speakResponse) voiceRequestIdsRef.current.add(requestId);
    if (speakResponse) setVoiceState('processing');
    setMessages((current) => [...current.slice(-(MAX_MESSAGES - 2)), { id: randomUuid(), role: 'user', content: prompt, status: 'complete', createdAt: Date.now(), requestId }, { id: assistantId, role: 'assistant', content: '', status: 'pending', createdAt: Date.now(), requestId }]);
    await runRequest(prompt, requestId, assistantId, sessionId, speechMode, speakResponse);
  }, [isHydrated, isPending, runRequest, sessionId, speechMode, stopPlayback, voiceState]);

  const retryMessage = useCallback((failedMessage: ChatMessageData) => {
    if (isPending) return;
    const failedIndex = messages.findIndex((message) => message.id === failedMessage.id);
    const source = failedIndex >= 0 ? [...messages.slice(0, failedIndex)].reverse().find((message) => message.role === 'user') : undefined;
    if (!source) return;
    const requestId = failedMessage.requestId ?? randomUuid();
    const retryMode = requestModesRef.current.get(requestId) ?? speechMode;
    const speakResponse = voiceRequestIdsRef.current.has(requestId);
    updateMessage(failedMessage.id, { requestId, status: 'pending', content: '' });
    setSessionUnavailable(false);
    if (speakResponse) setVoiceState('processing');
    void runRequest(source.content, requestId, failedMessage.id, sessionId, retryMode, speakResponse);
  }, [isPending, messages, runRequest, sessionId, speechMode, updateMessage]);

  const stopRequest = useCallback(() => {
    const activeRequestId = activeRequestIdRef.current;
    if (!activeRequestId) return;
    activeRequestIdRef.current = null;
    abortControllerRef.current?.abort();
    setIsPending(false);
    setVoiceState('idle');
    setMessages((current) => current.map((message) => message.requestId === activeRequestId && message.role === 'assistant' ? { ...message, content: t('chat.requestCancelled'), status: 'cancelled' } : message));
  }, [t]);

  const startNewChat = useCallback(() => {
    stopRequest();
    cancelRecording();
    stopPlayback();
    activeSessionIdRef.current = null;
    setMessages([]);
    setSessionId(null);
    setSessionUnavailable(false);
    setLoadError(null);
    setDraft('');
    setDraftFromVoice(false);
    setVoiceError(null);
    setHistoryOpen(false);
    router.push('/dashboard/chat', { scroll: false });
  }, [cancelRecording, router, stopPlayback, stopRequest]);

  const openConversation = useCallback((nextSessionId: string) => {
    if (nextSessionId === activeSessionIdRef.current) {
      setHistoryOpen(false);
      return;
    }
    stopRequest();
    cancelRecording();
    stopPlayback();
    setHistoryOpen(false);
    setDraftFromVoice(false);
    router.push(`/dashboard/chat?conversation=${encodeURIComponent(nextSessionId)}`, { scroll: false });
  }, [cancelRecording, router, stopPlayback, stopRequest]);

  const deleteConversation = useCallback(async (conversation: ConversationSummary) => {
    if (!window.confirm(t('chat.deleteConfirm', { title: conversation.title }))) return;
    setDeletingId(conversation.sessionId);
    try {
      const response = await authenticatedFetch(`/api/chat/${encodeURIComponent(conversation.sessionId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({})) as ChatResponse;
      if (!response.ok || payload.status !== 'success') throw new Error(errorMessageFor(payload, 'Could not delete this conversation.'));
      setConversations((current) => current.filter((item) => item.sessionId !== conversation.sessionId));
      if (conversation.sessionId === sessionId) {
        cancelRecording();
        stopPlayback();
        activeSessionIdRef.current = null;
        setMessages([]);
        setSessionId(null);
        setDraft('');
        router.replace('/dashboard/chat', { scroll: false });
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not delete this conversation.');
    } finally {
      setDeletingId(null);
    }
  }, [cancelRecording, router, sessionId, stopPlayback, t]);

  const historyProps = { conversations, selectedId: sessionId, deletingId, loading: isHistoryLoading, onOpen: openConversation, onDelete: deleteConversation, onNew: startNewChat };
  const submitDraft = () => void sendMessage(draft, draftFromVoice);
  const voiceStatusText: Record<VoiceState, string> = {
    idle: '',
    recording: 'Recording — tap the microphone to finish.',
    transcribing: 'Transcribing your recording…',
    processing: 'Preparing your voice reply…',
    speaking: 'Speaking reply…',
  };

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-7xl overflow-hidden border border-neutral-200 bg-white font-sans sm:min-h-[calc(100vh-5rem)] sm:rounded-2xl">
      <aside className="hidden w-64 shrink-0 border-r border-neutral-200 sm:block"><HistoryList {...historyProps} /></aside>
      {historyOpen && (
        <div className="fixed inset-0 z-[60] flex bg-black/25 sm:hidden" role="dialog" aria-modal="true" aria-label={t('chat.chats')}>
          <aside className="h-full w-[min(86vw,20rem)] border-r border-neutral-200 shadow-2xl"><HistoryList {...historyProps} onClose={() => setHistoryOpen(false)} /></aside>
          <button type="button" className="flex-1" onClick={() => setHistoryOpen(false)} aria-label={t('chat.closeHistory')} />
        </div>
      )}
      <section className="flex min-w-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 pb-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => setHistoryOpen(true)} className="rounded-xl border border-neutral-200 p-2 text-neutral-600 sm:hidden" aria-label={t('chat.openHistory')}><PanelLeft size={17} /></button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">{t('chat.assistantTitle')}</h1>
                {/* <span className="hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 md:inline">{t('chat.online')}</span> */}
              </div>
              <p className="mt-0.5 hidden text-xs text-neutral-500 md:block">{t('chat.assistantSubtitle')}</p>
            </div>
          </div>
          <button type="button" onClick={startNewChat} disabled={!hasConversation && !sessionId} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40" aria-label={t('chat.newChat')}><Plus size={14} /> <span className="hidden sm:inline">{t('chat.newChat')}</span></button>
        </header>
        <div className="flex flex-1 flex-col py-5">
          {loadError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800" role="alert">{loadError}</div>}
          {isConversationLoading ? (
            <div className="flex flex-1 items-center justify-center text-xs text-neutral-400">{t('chat.loadingConversations')}</div>
          ) : showStarters ? (
            <div className="flex flex-1 flex-col items-center justify-center px-2 py-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-700 shadow-sm"><MessageSquare size={26} strokeWidth={1.7} /></div>
              <h2 className="font-display text-xl font-bold text-neutral-900">{t('chat.howCanIHelp')}</h2>
              <p className="mt-2 max-w-lg text-xs leading-relaxed text-neutral-500">{t('chat.chatIntro')}</p>
              <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
                {starterPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} disabled={!isHydrated || isPending} className="group flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-3 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"><span>{prompt}</span><Sparkles size={13} className="ml-2 shrink-0 text-neutral-400 transition group-hover:text-amber-500" /></button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">{messages.map((message) => (
              <div key={message.id}>
                <ChatMessage message={message} onRetry={retryMessage} />
                {message.role === 'assistant' && message.status === 'complete' && message.content.trim() && message.requestId && (
                  <div className="mt-2 ml-1 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!sessionId || speechBusyRequestId === message.requestId}
                      onClick={() => {
                        if (activeAudioRequestId === message.requestId) stopPlayback();
                        else if (sessionId) void synthesizeSpeech(
                          sessionId,
                          message.requestId!,
                          requestModesRef.current.get(message.requestId!) ?? speechMode,
                          true,
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={activeAudioRequestId === message.requestId ? 'Stop spoken reply' : speechFailedIds.has(message.requestId) ? 'Retry spoken reply' : 'Play spoken reply'}
                    >
                      {speechBusyRequestId === message.requestId
                        ? <LoaderCircle size={13} className="animate-spin" />
                        : activeAudioRequestId === message.requestId ? <Square size={12} /> : speechReadyIds.has(message.requestId) ? <Volume2 size={13} /> : <Play size={13} />}
                      {speechBusyRequestId === message.requestId
                        ? 'Preparing audio…'
                        : activeAudioRequestId === message.requestId ? 'Stop' : speechFailedIds.has(message.requestId) ? 'Retry speech' : speechReadyIds.has(message.requestId) ? 'Play again' : 'Play answer'}
                    </button>
                    {speechFailedIds.has(message.requestId) && <span className="text-[11px] text-amber-700">Text reply is still available.</span>}
                  </div>
                )}
              </div>
            ))}</div>
          )}
          <div className="mt-auto pt-6">
            {sessionUnavailable && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900" role="alert"><span>{t('chat.sessionUnavailable')}</span><button type="button" onClick={startNewChat} className="shrink-0 font-semibold underline underline-offset-2">{t('chat.newChat')}</button></div>
            )}
            {isPending && <ThinkingBar onStop={stopRequest} />}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-500">
                Voice language
                <select
                  value={speechMode}
                  onChange={(event) => setSpeechMode(event.target.value as SpeechMode)}
                  disabled={voiceState === 'recording' || voiceState === 'transcribing'}
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 outline-none focus:border-neutral-500 disabled:opacity-50"
                  aria-label="Voice language"
                >
                  {SPEECH_MODES.map((mode) => <option key={mode} value={mode}>{mode === 'hindi' ? 'हिन्दी' : mode === 'hinglish' ? 'Hinglish' : 'English'}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={() => voiceState === 'recording' ? stopRecording() : void startRecording()}
                disabled={!isHydrated || isPending || isConversationLoading || voiceState === 'transcribing' || voiceState === 'processing'}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${voiceState === 'recording' ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-950'}`}
                aria-label={voiceState === 'recording' ? 'Stop recording' : 'Start voice recording'}
              >
                {voiceState === 'recording' ? <Square size={13} /> : <Mic size={14} />}
                {voiceState === 'recording' ? 'Finish recording' : 'Speak'}
              </button>
            </div>
            {voiceState !== 'idle' && <p className="mb-2 text-[11px] text-neutral-500" role="status">{voiceStatusText[voiceState]}</p>}
            {voiceError && <p className="mb-2 text-[11px] text-amber-700" role="status">{voiceError}</p>}
            {draftFromVoice && (
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                <span>Transcript ready — edit it before sending.</span>
                <button type="button" onClick={() => { setDraft(''); setDraftFromVoice(false); }} className="font-medium underline underline-offset-2">Clear transcript</button>
              </div>
            )}
            <PromptInput value={draft} onValueChange={setDraft} onSubmit={submitDraft} disabled={!isHydrated || isPending || isConversationLoading || voiceState === 'recording' || voiceState === 'transcribing'}>
              <PromptInputTextarea placeholder={t('chat.inputPlaceholder')} maxLength={MAX_PROMPT_LENGTH} />
              <PromptInputActions className="justify-between items-center">
                <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline pl-2 select-none">
                  Press ⌘↵ or Enter to send
                </span>
                <PromptInputAction tooltip={t('chat.sendMessageTooltip')}><button type="button" onClick={submitDraft} disabled={!isHydrated || isPending || !draft.trim() || voiceState === 'recording' || voiceState === 'transcribing'} className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400" aria-label={t('chat.sendMessageTooltip')}><ArrowUp size={17} strokeWidth={2.2} /></button></PromptInputAction>
              </PromptInputActions>
            </PromptInput>
            {latestAssistant?.status === 'complete' && <p className="mt-2 text-center text-[10px] text-neutral-400">{t('chat.footerNotice')}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ChatboxPage() {
  const { t } = useTranslation();
  return <Suspense fallback={<div className="flex min-h-[calc(100vh-9rem)] items-center justify-center text-xs text-neutral-400 sm:min-h-[calc(100vh-5rem)]">{t('chat.loadingChat')}</div>}><ChatboxContent /></Suspense>;
}
