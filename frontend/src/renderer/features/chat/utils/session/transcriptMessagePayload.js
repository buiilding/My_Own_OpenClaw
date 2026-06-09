import {
  buildTranscriptTransparencyFromChatMessage,
  normalizeOptionalString,
} from '../../../../infrastructure/transcript/rehydratePayload';
import {
  buildToolBundleMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import {
  buildRehydrateMessagePayload,
} from '../../../../infrastructure/transcript/rehydrateMessageState';
import {
  resolveReplayScreenshotState,
} from '../../../../infrastructure/services/screenshotMessageState';

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
  // Visual search trace rows are not replayed directly; SDK rehydrate
  // synthesizes paired web_search history from native tool_progress events.
  if (message?.type === 'search-source') {
    return null;
  }
  const role = resolveTranscriptRole(message);
  const messageType = resolveTranscriptMessageType(message);
  const normalizedToolBundleMessage = messageType === 'tool-bundle'
    ? buildToolBundleMessageState(
      (
        message?.toolCallDetails
        && typeof message.toolCallDetails === 'object'
        && !Array.isArray(message.toolCallDetails)
      ) ? message.toolCallDetails : null,
    )
    : null;
  const transparency = buildTranscriptTransparencyFromChatMessage(message);
  const screenshotAttachment = resolveReplayScreenshotState({
    screenshot: typeof message?.screenshot === 'string' ? message.screenshot : null,
    screenshotRef: typeof message?.screenshotRef === 'string' ? message.screenshotRef : null,
    screenshotUrl: typeof message?.screenshotUrl === 'string' ? message.screenshotUrl : null,
    screenshotContentType: typeof message?.screenshotContentType === 'string'
      ? message.screenshotContentType
      : null,
  });
  return buildRehydrateMessagePayload({
    role,
    messageType,
    rawContent: message.text || '',
    timestamp: message.timestamp || null,
    correlationId: normalizeOptionalString(message?.correlationId) || null,
    transparency,
    screenshotAttachment,
    rawToolCall: (
      message?.modelFacingToolCall
      && typeof message.modelFacingToolCall === 'object'
      && !Array.isArray(message.modelFacingToolCall)
    ) ? message.modelFacingToolCall : null,
    fallbackToolName: normalizeOptionalString(message?.toolName) || null,
    fallbackToolCallId: normalizeOptionalString(message?.correlationId) || null,
    toolCalls: normalizedToolBundleMessage?.toolCalls || null,
    toolCallDetails: (
      message?.toolCallDetails
      && typeof message.toolCallDetails === 'object'
      && !Array.isArray(message.toolCallDetails)
    ) ? message.toolCallDetails : null,
  });
}
