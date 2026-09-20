import { VOICE_MAX_AUDIO_BYTES, VOICE_MAX_DURATION_SECONDS } from '@/lib/voice-contract';

export const VOICE_SAMPLE_RATE = 16_000;

export function encodePcm16Wav(
  chunks: Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = VOICE_SAMPLE_RATE,
  maxBytes = VOICE_MAX_AUDIO_BYTES,
): Uint8Array {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new Error('The microphone returned an unsupported sample rate.');
  }
  const sourceLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (sourceLength === 0) throw new Error('No speech was recorded. Please try again.');
  const targetLength = Math.ceil(sourceLength * targetSampleRate / sourceSampleRate);
  const dataBytes = targetLength * 2;
  if (dataBytes + 44 > maxBytes) throw new Error('The recording reached the 1 MB upload limit.');

  const source = new Float32Array(sourceLength);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }

  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);
  const writeAscii = (position: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) wav[position + index] = value.charCodeAt(index);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * sourceSampleRate / targetSampleRate;
    const leftIndex = Math.min(Math.floor(sourcePosition), sourceLength - 1);
    const rightIndex = Math.min(leftIndex + 1, sourceLength - 1);
    const fraction = sourcePosition - leftIndex;
    const value = Math.max(-1, Math.min(1, source[leftIndex] * (1 - fraction) + source[rightIndex] * fraction));
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return wav;
}

export type VoiceCapture = {
  stop: () => Promise<Blob>;
  cancel: () => Promise<void>;
};

export async function startVoiceCapture(onLimitReached: () => void): Promise<VoiceCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
    throw new Error('Voice recording is not supported in this browser. You can still type your message.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let worklet: AudioWorkletNode | null = null;
  let mute: GainNode | null = null;
  try {
    try {
      context = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
    } catch {
      context = new AudioContext();
    }
    if (context.state === 'suspended') await context.resume();
    await context.audioWorklet.addModule('/pcm-capture-worklet.js');
    worklet = new AudioWorkletNode(context, 'finfine-pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { maxDurationSeconds: VOICE_MAX_DURATION_SECONDS },
    });
    source = context.createMediaStreamSource(stream);
    mute = context.createGain();
    mute.gain.value = 0;
    source.connect(worklet);
    worklet.connect(mute);
    mute.connect(context.destination);

    const chunks: Float32Array[] = [];
    let receivedLimit = false;
    let resolveStopped: (() => void) | undefined;
    const stopped = new Promise<void>((resolve) => { resolveStopped = resolve; });
    worklet.port.onmessage = (event: MessageEvent<{ type?: string; samples?: ArrayBuffer }>) => {
      if (event.data.type === 'samples' && event.data.samples instanceof ArrayBuffer) {
        chunks.push(new Float32Array(event.data.samples));
      } else if (event.data.type === 'limit' && !receivedLimit) {
        receivedLimit = true;
        onLimitReached();
      } else if (event.data.type === 'stopped') {
        resolveStopped?.();
      }
    };

    let finalizePromise: Promise<Uint8Array> | null = null;
    const finalize = async (): Promise<Uint8Array> => {
      if (!finalizePromise) {
        finalizePromise = (async () => {
          worklet?.port.postMessage({ type: 'stop' });
          await Promise.race([
            stopped,
            new Promise<void>((resolve) => window.setTimeout(resolve, 1_000)),
          ]);
          return encodePcm16Wav(chunks, context?.sampleRate ?? VOICE_SAMPLE_RATE);
        })();
      }
      return finalizePromise;
    };
    const cleanup = async () => {
      stream.getTracks().forEach((track) => track.stop());
      source?.disconnect();
      worklet?.disconnect();
      mute?.disconnect();
      if (context && context.state !== 'closed') await context.close().catch(() => undefined);
    };

    return {
      stop: async () => {
        try {
          const wav = await finalize();
          const buffer = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
          return new Blob([buffer], { type: 'audio/wav' });
        } finally {
          await cleanup();
        }
      },
      cancel: async () => {
        try {
          await finalize().catch(() => undefined);
        } finally {
          await cleanup();
        }
      },
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    source?.disconnect();
    worklet?.disconnect();
    mute?.disconnect();
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
    throw error;
  }
}
