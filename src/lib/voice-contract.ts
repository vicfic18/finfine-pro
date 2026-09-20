export const SPEECH_MODES = ['english', 'hindi', 'hinglish'] as const;

export type SpeechMode = (typeof SPEECH_MODES)[number];

export function isSpeechMode(value: unknown): value is SpeechMode {
  return typeof value === 'string' && SPEECH_MODES.some((mode) => mode === value);
}

export const VOICE_MAX_AUDIO_BYTES = 1_048_576;
export const VOICE_MAX_DURATION_SECONDS = 30;
