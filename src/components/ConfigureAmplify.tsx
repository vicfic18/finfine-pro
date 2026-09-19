'use client';

import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

// Authentication is handled entirely by client components in this app. Keep
// Amplify's default browser storage for Cognito tokens; enabling `ssr: true`
// switches token persistence to secure cookies and requires the Next.js
// server-side auth adapter, which this app does not configure.
Amplify.configure(outputs);

export default function ConfigureAmplifyClientSide() {
  return null;
}
