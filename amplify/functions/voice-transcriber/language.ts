export type VoiceMode = 'english' | 'hindi' | 'hinglish';

export type TranscribeLanguageOptions =
  | { LanguageCode: 'en-IN' | 'hi-IN' }
  | { IdentifyMultipleLanguages: true; LanguageOptions: 'en-IN,hi-IN' };

export function transcribeLanguageOptions(mode: VoiceMode): TranscribeLanguageOptions {
  if (mode === 'english') return { LanguageCode: 'en-IN' };
  if (mode === 'hindi') return { LanguageCode: 'hi-IN' };
  return { IdentifyMultipleLanguages: true, LanguageOptions: 'en-IN,hi-IN' };
}
