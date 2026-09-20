import assert from 'node:assert/strict';
import { test } from 'node:test';

import { encodePcm16Wav } from '../src/lib/voice-capture';
import { transcribeLanguageOptions } from '../amplify/functions/voice-transcriber/language';

test('encodes mono 16-bit PCM WAV with the required sample rate', () => {
  const wav = encodePcm16Wav([new Float32Array([-1, 0, 1])], 16_000);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const header = new TextDecoder().decode(wav.slice(0, 4));
  assert.equal(header, 'RIFF');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
});

test('resamples input and enforces the encoded byte cap', () => {
  const wav = encodePcm16Wav([new Float32Array(8).fill(0.25)], 8_000);
  assert.equal(new DataView(wav.buffer).getUint32(24, true), 16_000);
  assert.equal(new DataView(wav.buffer).getUint32(40, true), 32);
  assert.throws(() => encodePcm16Wav([new Float32Array(100)], 16_000, 16_000, 100), /1 MB/);
  assert.throws(() => encodePcm16Wav([new Float32Array()], 16_000), /No speech/);
});

test('selects fixed Indian languages or exactly the English-Hindi multi-language pair', () => {
  assert.deepEqual(transcribeLanguageOptions('english'), { LanguageCode: 'en-IN' });
  assert.deepEqual(transcribeLanguageOptions('hindi'), { LanguageCode: 'hi-IN' });
  assert.deepEqual(transcribeLanguageOptions('hinglish'), {
    IdentifyMultipleLanguages: true,
    LanguageOptions: 'en-IN,hi-IN',
  });
});
