import { defineFunction } from '@aws-amplify/backend';

export const ingestionNormalizer = defineFunction({
  name: 'ingestion-normalizer',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  runtime: 22,
});
