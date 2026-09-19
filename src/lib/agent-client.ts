import outputs from '@/../amplify_outputs.json';

export interface AgentInvocationRequest {
  prompt: string;
}

export interface AgentInvocationResponse {
  status: 'success' | 'error';
  answer?: string;
  error?: string;
}

/**
 * Resolves the agent backend URL from Amplify outputs, environment variables, or local fallback.
 */
export function getAgentApiUrl(): string {
  const customOutputs = (outputs as { custom?: { agentApiUrl?: string } }).custom;
  if (customOutputs?.agentApiUrl) {
    return customOutputs.agentApiUrl.replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_AGENT_API_URL) {
    return process.env.NEXT_PUBLIC_AGENT_API_URL.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8080';
}

/**
 * Health check on the agent backend.
 */
export async function pingAgent(): Promise<boolean> {
  const baseUrl = getAgentApiUrl();
  try {
    const res = await fetch(`${baseUrl}/ping`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Invocations endpoint caller for FinFine Pro agent.
 */
export async function askAgent(prompt: string, token?: string): Promise<string> {
  const baseUrl = getAgentApiUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}/invocations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt }),
  });

  const data: AgentInvocationResponse = await res.json().catch(() => ({
    status: 'error',
    error: `HTTP ${res.status}: Failed to parse response from agent service`,
  }));

  if (!res.ok || data.status === 'error') {
    throw new Error(data.error || `Agent invocation failed with HTTP ${res.status}`);
  }

  return data.answer || 'No answer provided by agent.';
}
