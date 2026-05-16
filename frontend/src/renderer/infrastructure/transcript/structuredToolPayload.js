import {
  normalizeMessageType,
  parseToolCallPayload,
} from './rehydratePayload';
import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from './toolCallMessageState';

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

function parseBundleToolPayload(rawContent) {
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {
    return undefined;
  }

  return undefined;
}

export function resolveStructuredBundlePayload(structuredPayload) {
  if (structuredPayload?.kind !== 'tool-bundle') {
    return null;
  }

  const details = cloneObject(structuredPayload.toolCallDetails) || {};
  if (!Array.isArray(structuredPayload.toolCalls) || structuredPayload.toolCalls.length === 0) {
    return Object.keys(details).length > 0 ? details : null;
  }

  return {
    ...details,
    tools: structuredPayload.toolCalls.map((tool) => ({
      ...(tool?.name ? { name: tool.name } : {}),
      args: (
        tool?.arguments
        && typeof tool.arguments === 'object'
        && !Array.isArray(tool.arguments)
      ) ? { ...tool.arguments } : {},
      ...(tool?.metadata ? { metadata: tool.metadata } : {}),
    })),
  };
}

export function resolveStructuredToolOutputDetails(structuredPayload) {
  if (structuredPayload?.kind !== 'tool-output') {
    return null;
  }
  return cloneObject(structuredPayload.toolCallDetails);
}

export function buildStoredTranscriptToolMessageState({
  messageType,
  rawContent = '',
  structuredPayload = null,
}) {
  const normalizedMessageType = normalizeMessageType(messageType);
  const text = typeof rawContent === 'string' && rawContent.length > 0 ? rawContent : '(empty)';

  if (normalizedMessageType === 'tool-bundle') {
    const bundlePayload = resolveStructuredBundlePayload(structuredPayload)
      || parseBundleToolPayload(rawContent)
      || undefined;
    const bundleState = buildToolBundleMessageState(bundlePayload);
    return {
      text: bundleState.text || text,
      type: 'tool-call',
      toolCallDisplayText: bundleState.toolCallDisplayText || text,
      toolCallDetails: bundleState.toolCallDetails || null,
      sourceEventType: 'tool-bundle',
    };
  }

  if (normalizedMessageType === 'tool-call') {
    const toolCallState = buildToolCallMessageState({
      rawContent: rawContent || '',
      rawToolCall: structuredPayload?.kind === 'tool-call'
        ? structuredPayload.toolCall
        : parseToolCallPayload(rawContent || ''),
    });
    return {
      text: toolCallState.text || text,
      type: 'tool-call',
      toolCallDisplayText: toolCallState.toolCallDisplayText || text,
      modelFacingToolCall: toolCallState.modelFacingToolCall || null,
      toolCallDetails: toolCallState.toolCallDetails || null,
    };
  }

  if (normalizedMessageType === 'tool-output') {
    const toolOutputDetails = resolveStructuredToolOutputDetails(structuredPayload);
    return {
      text,
      type: 'tool-output',
      ...(toolOutputDetails ? {
        modelFacingToolOutput: text,
        toolOutputDetails,
      } : {}),
    };
  }

  return null;
}
