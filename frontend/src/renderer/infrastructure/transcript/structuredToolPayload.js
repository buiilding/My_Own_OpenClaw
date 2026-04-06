import { normalizeMessageType } from './rehydratePayload';
import { buildToolBundleMessageState } from './toolCallMessageState';

function cloneObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

function cloneObjectList(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const cloned = value
    .map((entry) => cloneObject(entry))
    .filter((entry) => entry !== null);
  return cloned.length > 0 ? cloned : null;
}

function normalizeStructuredKind(value) {
  const normalized = normalizeMessageType(value);
  if (
    normalized === 'tool-call'
    || normalized === 'tool-bundle'
    || normalized === 'tool-output'
  ) {
    return normalized;
  }
  return null;
}

export function buildStructuredToolPayload({
  kind,
  toolCall = null,
  toolCalls = null,
  toolCallDetails = null,
}) {
  const normalizedKind = normalizeStructuredKind(kind);
  if (!normalizedKind) {
    return null;
  }

  const normalizedToolCall = cloneObject(toolCall);
  let normalizedToolCalls = cloneObjectList(toolCalls);
  const normalizedToolCallDetails = cloneObject(toolCallDetails);

  if (normalizedKind === 'tool-bundle' && normalizedToolCalls === null && normalizedToolCallDetails) {
    normalizedToolCalls = buildToolBundleMessageState(normalizedToolCallDetails).toolCalls;
  }

  if (normalizedKind === 'tool-call' && normalizedToolCalls === null && normalizedToolCall) {
    normalizedToolCalls = [normalizedToolCall];
  }

  const payload = {
    kind: normalizedKind,
    ...(normalizedToolCall ? { toolCall: normalizedToolCall } : {}),
    ...(normalizedToolCalls ? { toolCalls: normalizedToolCalls } : {}),
    ...(normalizedToolCallDetails ? { toolCallDetails: normalizedToolCallDetails } : {}),
  };

  return Object.keys(payload).length > 1 ? payload : null;
}

export function normalizeStructuredToolPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return null;
  }

  return buildStructuredToolPayload({
    kind: rawPayload.kind || rawPayload.type || null,
    toolCall: rawPayload.toolCall || rawPayload.modelFacingToolCall || null,
    toolCalls: rawPayload.toolCalls || null,
    toolCallDetails: rawPayload.toolCallDetails || rawPayload.details || null,
  });
}

export function readStructuredToolPayload(...sources) {
  for (const source of sources) {
    const normalized = normalizeStructuredToolPayload(source);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}
