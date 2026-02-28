import {
  buildRehydrateToolCall,
  buildTranscriptTransparencyFromChatMessage,
  normalizeOptionalString,
  resolveRehydrateContent,
} from '../../../infrastructure/transcript/rehydratePayload';

const TOOL_MESSAGE_TYPES = new Set(['tool-call', 'tool-output']);

function normalizeToolCallFromMessage(message) {
  const rawToolCall = (
    message?.modelFacingToolCall
    && typeof message.modelFacingToolCall === 'object'
    && !Array.isArray(message.modelFacingToolCall)
  ) ? message.modelFacingToolCall : null;
  if (!rawToolCall) {
    return null;
  }

  return buildRehydrateToolCall({
    parsedToolCall: {
      id: normalizeOptionalString(rawToolCall.id) || undefined,
      name: normalizeOptionalString(rawToolCall.name) || undefined,
      arguments: (
        rawToolCall.arguments
        && typeof rawToolCall.arguments === 'object'
        && !Array.isArray(rawToolCall.arguments)
      ) ? { ...rawToolCall.arguments } : {},
      thought_signature: normalizeOptionalString(
        rawToolCall.thought_signature || rawToolCall.thoughtSignature,
      ) || undefined,
    },
    fallbackToolName: null,
    fallbackToolCallId: null,
  });
}

export function normalizeProvider(provider) {
  return provider === undefined || provider === null
    ? ''
    : String(provider).trim().toLowerCase();
}

export function resolveTranscriptRole(message) {
  if (message.sender === 'user') {
    return 'user';
  }
  if (message.type && TOOL_MESSAGE_TYPES.has(message.type)) {
    return 'tool';
  }
  return 'assistant';
}

export function resolveTranscriptMessageType(message) {
  if (message.sender === 'user') {
    return 'user';
  }
  return message.type || 'llm-text';
}

export function toRehydratePayload(message) {
  const role = resolveTranscriptRole(message);
  const messageType = resolveTranscriptMessageType(message);
  const toolCall = normalizeToolCallFromMessage(message);
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
  const normalizedToolCall = role === 'tool' && messageType === 'tool-call'
    ? buildRehydrateToolCall({
      parsedToolCall: toolCall,
      fallbackToolName: toolName,
      fallbackToolCallId: toolCallId,
    })
    : null;

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
  };
}
