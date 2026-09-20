'use client';

import { fetchAuthSession } from 'aws-amplify/auth';

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error('Authentication is required.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  // Let fetch add the multipart boundary for browser FormData uploads.
  if (init.body && !(typeof FormData !== 'undefined' && init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers, cache: init.cache || 'no-store' });
}
