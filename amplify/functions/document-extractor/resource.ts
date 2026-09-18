import { defineFunction } from '@aws-amplify/backend';

export const documentExtractor = defineFunction({
  name: 'document-extractor',
  entry: './handler.ts',
  timeoutSeconds: 120,
  memoryMB: 1024,
  runtime: 22,
  environment: {
    BEDROCK_MODEL_ID: 'nvidia.nemotron-nano-12b-v2',
  },
});
