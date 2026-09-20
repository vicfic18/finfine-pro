import {
  isConversationDeleteResponse,
  isConversationResponse,
  isRecord,
  isUuid,
  type ChatErrorResponse,
} from '@/lib/chat-contract';
import { bearerToken, readJson, runtimeFetch, upstreamErrorStatus } from '@/lib/chat-runtime';
import { AuthenticationConfigurationError, AuthenticationError } from '@/lib/server-auth';
import { OnboardingRequiredError, requireCompletedOnboarding } from '@/lib/onboarding-store';

function errorResponse(status: number, code: string, message: string): Response {
  const body: ChatErrorResponse = { status: 'error', requestId: null, code, message };
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function proxyConversation(
  request: Request,
  sessionId: string,
  method: 'GET' | 'DELETE',
): Promise<Response> {
  if (!isUuid(sessionId)) return errorResponse(400, 'invalid_session_id', 'sessionId must be a valid UUID.');
  if (!bearerToken(request)) return errorResponse(401, 'unauthorized', 'A Bearer access token is required.');
  try {
    await requireCompletedOnboarding(request);
  } catch (error) {
    if (error instanceof AuthenticationConfigurationError) return errorResponse(503, 'auth_unavailable', error.message);
    if (error instanceof AuthenticationError) return errorResponse(401, 'unauthorized', error.message);
    if (error instanceof OnboardingRequiredError) return errorResponse(403, error.code, error.message);
    return errorResponse(503, 'onboarding_unavailable', 'Onboarding status is unavailable.');
  }

  const result = await runtimeFetch(request, `conversations/${encodeURIComponent(sessionId)}`, method);
  if (!result.response) {
    if (result.error === 'config') return errorResponse(503, 'runtime_unavailable', 'The agent runtime is not available.');
    if (result.error === 'timeout') return errorResponse(504, 'runtime_timeout', 'The agent took too long to respond.');
    if (result.error === 'aborted') return errorResponse(499, 'request_aborted', 'The request was cancelled.');
    return errorResponse(502, 'runtime_unreachable', 'The agent could not be reached.');
  }

  const upstreamBody = await readJson(result.response);
  if (!result.response.ok) {
    if (
      result.response.status === 409 &&
      isRecord(upstreamBody) &&
      upstreamBody.code === 'SESSION_UNAVAILABLE'
    ) {
      return errorResponse(404, 'conversation_not_found', 'This conversation is no longer available.');
    }
    const mapped = upstreamErrorStatus(result.response.status);
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
  const valid = method === 'GET'
    ? isConversationResponse(upstreamBody)
    : isConversationDeleteResponse(upstreamBody);
  if (!valid) return errorResponse(502, 'invalid_runtime_response', 'The agent returned an invalid response.');
  return Response.json(upstreamBody, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  return proxyConversation(request, sessionId, 'GET');
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  return proxyConversation(request, sessionId, 'DELETE');
}
