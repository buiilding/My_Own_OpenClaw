const MAX_THINKING_STATUS_LENGTH = 5000;

type ToolCallPayloadLike = {
  tool_name?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type ToolBundlePayloadLike = {
  bundle_id?: string;
  tools?: Array<{ name?: string; args?: Record<string, unknown> }>;
};

type ToolOutputPayloadLike = {
  error?: string | null;
  output?: string;
};

export function buildThinkingStatus(currentStatus: string | null, chunk?: string): string {
  const updated = (currentStatus || '') + (chunk || '');
  return updated.length > MAX_THINKING_STATUS_LENGTH
    ? updated.slice(-MAX_THINKING_STATUS_LENGTH)
    : updated;
}

export function formatToolCallPayload(payload?: ToolCallPayloadLike): string {
  return JSON.stringify(
    {
      name: payload?.tool_name,
      args: payload?.parameters,
      metadata: payload?.metadata,
    },
    null,
    2,
  );
}

export function formatToolBundlePayload(payload?: ToolBundlePayloadLike): string {
  return JSON.stringify(
    {
      bundle_id: payload?.bundle_id,
      tools: payload?.tools || [],
    },
    null,
    2,
  );
}

export function formatToolOutputText(payload?: ToolOutputPayloadLike): string {
  if (payload?.error) {
    return `Error: ${payload.error}`;
  }
  return payload?.output || 'No output';
}
