import {
  buildRehydrateToolCall,
  buildTranscriptTransparencyFromChatMessage,
  normalizeOptionalString,
  resolveRehydrateContent,
} from '../../../../infrastructure/transcript/rehydratePayload';
import {
  buildToolCallMessageState,
  buildToolBundleMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import {
  buildStructuredToolPayload,
} from '../../../../infrastructure/transcript/structuredToolPayload';

const TOOL_OUTPUT_MESSAGE_TYPES = new Set(['tool-output']);

export function normalizeProvider(provider) {
  return provider === undefined || provider === null
    ? ''
    : String(provider).trim().toLowerCase();
}

export function resolveTranscriptRole(message) {
  if (message.sender === 'user') {
    return 'user';
  }
  if (message.type && TOOL_OUTPUT_MESSAGE_TYPES.has(message.type)) {
    return 'tool';
  }
  return 'assistant';
}

export function resolveTranscriptMessageType(message) {
  if (message.sender === 'user') {
    return 'user';
  }
  if (message.type === 'tool-call' && normalizeOptionalString(message.sourceEventType) === 'tool-bundle') {
    return 'tool-bundle';
  }
  return message.type || 'llm-text';
}

export function toRehydratePayload(message) {
  // Live `search-source` rows are transient UI trace messages, not transcript history.
  if (message?.type === 'search-source') {
    return null;
  }
  const role = resolveTranscriptRole(message);
  const messageType = resolveTranscriptMessageType(message);
  const normalizedToolCallMessage = buildToolCallMessageState({
    rawContent: typeof message?.text === 'string' ? message.text : null,
    rawToolCall: (
      message?.modelFacingToolCall
      && typeof message.modelFacingToolCall === 'object'
      && !Array.isArray(message.modelFacingToolCall)
    ) ? message.modelFacingToolCall : null,
    fallbackToolName: normalizeOptionalString(message?.toolName) || null,
    fallbackToolCallId: normalizeOptionalString(message?.correlationId) || null,
    toolCallDetails: (
      message?.toolCallDetails
      && typeof message.toolCallDetails === 'object'
      && !Array.isArray(message.toolCallDetails)
    ) ? message.toolCallDetails : null,
  });
  const normalizedToolBundleMessage = messageType === 'tool-bundle'
    ? buildToolBundleMessageState(
      (
        message?.toolCallDetails
        && typeof message.toolCallDetails === 'object'
        && !Array.isArray(message.toolCallDetails)
      ) ? message.toolCallDetails : null,
    )
    : null;
  const toolCall = buildRehydrateToolCall({
    parsedToolCall: normalizedToolCallMessage.modelFacingToolCall,
    fallbackToolName: normalizeOptionalString(message?.toolName) || null,
    fallbackToolCallId: normalizeOptionalString(message?.correlationId) || null,
  });
  const toolCallId = role === 'tool'
    ? (normalizeOptionalString(message.correlationId) || toolCall?.id || null)
    : null;
  const toolName = role === 'tool'
    ? (normalizeOptionalString(message.toolName) || toolCall?.name || null)
    : null;
  const transparency = buildTranscriptTransparencyFromChatMessage(message);
  const content = resolveRehydrateContent({
    role,
    messageType,
    content: message.text || '',
    transparency,
  });
  const normalizedToolCall = messageType === 'tool-call'
    ? buildRehydrateToolCall({
      parsedToolCall: toolCall,
      fallbackToolName: normalizeOptionalString(message.toolName) || toolCall?.name || null,
      fallbackToolCallId: normalizeOptionalString(message.correlationId) || toolCall?.id || null,
    })
    : null;
  const structuredPayload = buildStructuredToolPayload({
    kind: messageType,
    toolCall: normalizedToolCallMessage.modelFacingToolCall,
    toolCalls: normalizedToolBundleMessage?.toolCalls || null,
    toolCallDetails: (
      message?.toolCallDetails
      && typeof message.toolCallDetails === 'object'
      && !Array.isArray(message.toolCallDetails)
    ) ? message.toolCallDetails : null,
  });

  return {
    role,
    content,
    message_type: messageType,
    tool_name: toolName,
    correlation_id: role === 'tool' ? (message.correlationId || null) : null,
    tool_call_id: toolCallId,
    tool_calls: normalizedToolCall ? [normalizedToolCall] : null,
    timestamp: message.timestamp || null,
    screenshot_ref: typeof message.screenshotRef === 'string' ? message.screenshotRef : null,
    screenshot: null,
    transparency,
    structured_payload: structuredPayload,
  };
}
