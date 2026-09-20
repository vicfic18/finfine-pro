import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from '@aws-sdk/client-transcribe-streaming';
import { transcribeLanguageOptions, type VoiceMode } from './language';

const SAMPLE_RATE_HZ = 16_000;
const MAX_PCM_BYTES = SAMPLE_RATE_HZ * 2 * 30;
const CHUNK_BYTES = 3_200;
const region = process.env.VOICE_AWS_REGION?.trim() || 'ap-south-1';
const transcribeClient = new TranscribeStreamingClient({ region });

type TranscribeEvent = {
  audioBase64?: unknown;
  mode?: unknown;
};

type TranscribeSuccess = {
  status: 'success';
  transcript: string;
  detectedLanguages: string[];
};

type TranscribeFailure = {
  status: 'error';
  code: string;
};

function isVoiceMode(value: unknown): value is VoiceMode {
  return value === 'english' || value === 'hindi' || value === 'hinglish';
}

async function* pcmAudioStream(pcm: Buffer) {
  for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
    if (offset > 0) await new Promise((resolve) => setTimeout(resolve, 100));
    yield {
      AudioEvent: {
        AudioChunk: pcm.subarray(offset, Math.min(offset + CHUNK_BYTES, pcm.length)),
      },
    };
  }
}

function classifyError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (/throttl|limitexceeded/i.test(name)) return 'TRANSCRIBE_THROTTLED';
  if (/timeout|timedout/i.test(name)) return 'TRANSCRIBE_TIMEOUT';
  return 'TRANSCRIBE_FAILED';
}

export async function handler(event: TranscribeEvent): Promise<TranscribeSuccess | TranscribeFailure> {
  const startedAt = Date.now();
  const mode = isVoiceMode(event.mode) ? event.mode : null;
  if (!mode || typeof event.audioBase64 !== 'string' || !event.audioBase64 || event.audioBase64.length > 1_300_000) {
    return { status: 'error', code: 'INVALID_REQUEST' };
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.audioBase64)) {
    return { status: 'error', code: 'INVALID_AUDIO' };
  }
  const pcm = Buffer.from(event.audioBase64, 'base64');
  if (pcm.length === 0 || pcm.length > MAX_PCM_BYTES || pcm.length % 2 !== 0) {
    return { status: 'error', code: 'INVALID_AUDIO' };
  }

  try {
    const response = await transcribeClient.send(new StartStreamTranscriptionCommand({
      ...transcribeLanguageOptions(mode),
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: SAMPLE_RATE_HZ,
      AudioStream: pcmAudioStream(pcm),
    }));
    const transcriptParts: string[] = [];
    const detectedLanguages = new Set<string>();
    if (response.TranscriptResultStream) {
      for await (const eventItem of response.TranscriptResultStream) {
        const results = eventItem.TranscriptEvent?.Transcript?.Results ?? [];
        for (const result of results) {
          if (result.IsPartial) continue;
          const text = result.Alternatives?.[0]?.Transcript?.trim();
          if (text) transcriptParts.push(text);
          const language = result.LanguageCode;
          if (language === 'en-IN' || language === 'hi-IN') detectedLanguages.add(language);
        }
      }
    }
    const transcript = transcriptParts.join(' ').trim();
    console.info(JSON.stringify({
      event: 'voice_transcription_completed',
      mode,
      audioBytes: pcm.length,
      latencyMs: Date.now() - startedAt,
      detectedLanguageCount: detectedLanguages.size,
    }));
    if (!transcript) return { status: 'error', code: 'EMPTY_TRANSCRIPT' };
    return { status: 'success', transcript, detectedLanguages: [...detectedLanguages] };
  } catch (error) {
    const code = classifyError(error);
    console.warn(JSON.stringify({
      event: 'voice_transcription_failed',
      mode,
      errorType: error instanceof Error ? error.name : 'UnknownError',
      latencyMs: Date.now() - startedAt,
    }));
    return { status: 'error', code };
  }
}
