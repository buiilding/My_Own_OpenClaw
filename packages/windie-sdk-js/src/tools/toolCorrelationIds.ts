/**
 * Provides the tool correlation ids module for the TypeScript SDK runtime.
 */

type ToolCorrelationPayload = unknown;

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(payload: ToolCorrelationPayload, ...keys: string[]): string | null {
  const record = recordFromUnknown(payload);
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function resolveModelFacingToolCallId(payload: ToolCorrelationPayload): string | null {
  const metadata = recordFromUnknown(recordFromUnknown(payload)?.metadata);
  const toolCall = recordFromUnknown(metadata?.model_facing_tool_call);
  return stringField(toolCall, 'id');
}

export function resolveCorrelationId(
  ...ids: Array<string | null | undefined>
): string | null {
  for (const id of ids) {
    if (typeof id === 'string' && id.trim()) {
      return id.trim();
    }
  }
  return null;
}

export function resolveToolCallCorrelationId(
  payload: ToolCorrelationPayload,
  eventId?: string | null,
): string | undefined {
  return resolveCorrelationId(
    stringField(payload, 'correlationId', 'correlation_id'),
    stringField(payload, 'requestId', 'request_id'),
    stringField(payload, 'toolCallId', 'tool_call_id'),
    resolveModelFacingToolCallId(payload),
    eventId,
  ) ?? undefined;
}

export function resolveToolOutputCorrelationId(
  payload: ToolCorrelationPayload,
  eventId?: string | null,
): string | undefined {
  const metadata = recordFromUnknown(recordFromUnknown(payload)?.metadata);
  return resolveCorrelationId(
    stringField(payload, 'requestId', 'request_id'),
    stringField(payload, 'toolCallId', 'tool_call_id'),
    stringField(metadata, 'toolCallId', 'tool_call_id'),
    eventId,
  ) ?? undefined;
}

export function resolveToolBundleCorrelationId(
  payload: ToolCorrelationPayload,
  eventId?: string | null,
): string | undefined {
  return resolveCorrelationId(
    stringField(payload, 'bundleId', 'bundle_id'),
    eventId,
  ) ?? undefined;
}

export function resolveToolWaitId(payload: ToolCorrelationPayload): string | null {
  return resolveCorrelationId(
    stringField(payload, 'requestId', 'request_id'),
    stringField(payload, 'bundleId', 'bundle_id'),
    stringField(payload, 'correlationId', 'correlation_id'),
    stringField(payload, 'toolCallId', 'tool_call_id'),
  );
}

export function resolveToolEventCorrelationId(payload: ToolCorrelationPayload): string | null {
  return resolveCorrelationId(
    stringField(payload, 'requestId', 'request_id'),
    stringField(payload, 'bundleId', 'bundle_id'),
    stringField(payload, 'toolCallId', 'tool_call_id'),
    stringField(payload, 'correlationId', 'correlation_id'),
  );
}

export function resolveToolOutputCorrelationKeys(payload: ToolCorrelationPayload): string[] {
  const keys: string[] = [];
  const toolCallId = stringField(payload, 'toolCallId', 'tool_call_id');
  if (toolCallId) {
    keys.push(`tool-call:${toolCallId}`);
  }
  const requestId = stringField(payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
  if (requestId) {
    keys.push(`request:${requestId}`);
  }
  const bundleId = stringField(payload, 'bundleId', 'bundle_id');
  if (bundleId) {
    keys.push(`bundle:${bundleId}`);
  }
  return keys;
}

export function resolveToolOutputDedupeKey(payload: ToolCorrelationPayload): string | null {
  const requestId = stringField(payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
  if (requestId) {
    return `request:${requestId}`;
  }
  const bundleId = stringField(payload, 'bundleId', 'bundle_id');
  if (bundleId) {
    return `bundle:${bundleId}`;
  }
  const toolCallId = stringField(payload, 'toolCallId', 'tool_call_id');
  return toolCallId ? `tool-call:${toolCallId}` : null;
}

export function resolveToolPairKeys(
  payload: ToolCorrelationPayload,
  options: { bundle?: boolean } = {},
): string[] {
  if (options.bundle) {
    const bundleId = stringField(payload, 'bundleId', 'bundle_id');
    return bundleId ? [`bundle:${bundleId}`] : [];
  }
  const keys: string[] = [];
  const toolCallId = stringField(payload, 'toolCallId', 'tool_call_id');
  if (toolCallId) {
    keys.push(`tool-call:${toolCallId}`);
  }
  const requestId = stringField(payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
  if (requestId) {
    keys.push(`request:${requestId}`);
  }
  return keys;
}
