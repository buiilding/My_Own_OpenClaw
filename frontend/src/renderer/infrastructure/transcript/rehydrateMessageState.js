/**
 * Provides the rehydrate message state module for the renderer UI.
 */

import {
  buildRehydrateToolCall,
  normalizeMessageType,
  normalizeOptionalString,
  parseToolCallPayload,
  resolveRehydrateContent,
} from './rehydratePayload';
import {
  buildStructuredToolPayload,
  readStructuredToolPayload,
} from './structuredToolPayload';
import {
  buildToolCallMessageState,
} from './toolCallMessageState';

function cloneObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

export function resolveRehydrateToolState({
  messageType,
  rawContent = '',
  structuredPayload = null,
  rawToolCall = null,
  fallbackToolName = null,
  fallbackToolCallId = null,
  toolCallDetails = null,
  toolCalls = null,
}) {
  const normalizedMessageType = normalizeMessageType(messageType);
  const normalizedStructuredPayload = readStructuredToolPayload(structuredPayload);
  const normalizedToolCallDetails = cloneObject(toolCallDetails);

  const parsedToolCall = normalizedMessageType === 'tool-call'
    ? (
      normalizedStructuredPayload?.kind === 'tool-call'
        ? normalizedStructuredPayload.toolCall
        : buildToolCallMessageState({
          rawContent: rawContent || '',
          rawToolCall: (
            rawToolCall
            && typeof rawToolCall === 'object'
            && !Array.isArray(rawToolCall)
          ) ? rawToolCall : parseToolCallPayload(rawContent || ''),
          fallbackToolName: normalizeOptionalString(fallbackToolName) || null,
          fallbackToolCallId: normalizeOptionalString(fallbackToolCallId) || null,
          toolCallDetails: normalizedToolCallDetails,
        }).modelFacingToolCall
    )
    : null;

  const resolvedToolCallId = normalizeOptionalString(fallbackToolCallId || parsedToolCall?.id);
  const resolvedToolName = normalizeOptionalString(fallbackToolName || parsedToolCall?.name);
  const normalizedToolCall = normalizedMessageType === 'tool-call'
    ? buildRehydrateToolCall({
      parsedToolCall,
      fallbackToolName: resolvedToolName,
      fallbackToolCallId: resolvedToolCallId,
    })
    : null;

  return {
    normalizedMessageType,
    parsedToolCall,
    resolvedToolCallId,
    resolvedToolName,
    normalizedToolCall,
    structuredPayload: normalizedStructuredPayload || buildStructuredToolPayload({
      kind: normalizedMessageType,
      toolCall: parsedToolCall,
      toolCalls,
      toolCallDetails: normalizedToolCallDetails,
    }),
  };
}

export function buildRehydrateMessagePayload({
  role,
  messageType,
  rawContent = '',
  timestamp = null,
  correlationId = null,
  transparency = null,
  screenshotAttachment = null,
  structuredPayload = null,
  rawToolCall = null,
  fallbackToolName = null,
  fallbackToolCallId = null,
  toolCallDetails = null,
  toolCalls = null,
}) {
  const toolState = resolveRehydrateToolState({
    messageType,
    rawContent,
    structuredPayload,
    rawToolCall,
    fallbackToolName,
    fallbackToolCallId,
    toolCallDetails,
    toolCalls,
  });
  const normalizedCorrelationId = normalizeOptionalString(correlationId);
  const isToolLinkedRow = role === 'tool' || toolState.normalizedMessageType === 'tool-call';

  return {
    role,
    content: resolveRehydrateContent({
      role,
      messageType,
      content: rawContent,
      transparency,
    }),
    message_type: messageType,
    tool_name: isToolLinkedRow ? toolState.resolvedToolName : null,
    correlation_id: isToolLinkedRow
      ? (normalizedCorrelationId || toolState.resolvedToolCallId || null)
      : null,
    tool_call_id: isToolLinkedRow ? (toolState.resolvedToolCallId || null) : null,
    tool_calls: toolState.normalizedToolCall ? [toolState.normalizedToolCall] : null,
    timestamp: timestamp || null,
    screenshot_ref: normalizeOptionalString(screenshotAttachment?.screenshotRef) || null,
    screenshot: normalizeOptionalString(screenshotAttachment?.screenshot) || null,
    transparency,
    structured_payload: toolState.structuredPayload,
  };
}
