/**
 * Projects SDK current-turn state into renderer chat message rows.
 */

import { DesktopChatMessageRuntimeClient } from './desktopChatMessageRuntimeClient';
import { DesktopPresentationSourceChannels } from './desktopPresentationSourceChannels';
import { DesktopSdkDisplayAttachmentProjection } from './desktopSdkDisplayAttachmentProjection';
import { DesktopSdkToolDetailProjection } from './desktopSdkToolDetailProjection';

const {
  buildToolCallChatMessageState,
  buildToolOutputChatMessageState,
} = DesktopChatMessageRuntimeClient;
const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;
const {
  sanitizeSdkToolDetailRecord,
} = DesktopSdkToolDetailProjection;

const sdkCurrentTurnSourceChannel = DesktopPresentationSourceChannels.getSdkCurrentTurnSourceChannel();
const sdkConversationViewSourceChannel = DesktopPresentationSourceChannels
  .getSdkConversationViewSourceChannel();

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function readString(value) {
  return typeof value === 'string' ? value : null;
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value : '';
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveNoViewSdkLiveTurnThinkingText(sdkLiveTurn = null) {
  if (hasPresentationObject(sdkLiveTurn)) {
    return '';
  }
  return normalizeOptionalText(asRecord(sdkLiveTurn)?.reasoningText) || '';
}

function normalizeEntryType(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'llm-text';
}

function buildProjectedToolCallMessage({
  baseId,
  turnRef,
  toolEvent,
}) {
  const payload = asObject(toolEvent.payload);
  const toolCallDetails = asObject(toolEvent.toolCallDetails);
  const displayToolCallDetails = sanitizeSdkToolDetailRecord(toolCallDetails);
  const toolName = readString(toolEvent.toolName) || readString(payload?.toolName) || '';
  const correlationId = (
    readString(toolEvent.correlationId)
    || readString(toolEvent.requestId)
    || readString(payload?.requestId)
  );
  const text = normalizeText(toolEvent.text) || (toolName ? `Using ${toolName}` : 'Using tool');

  return buildToolCallChatMessageState({
    id: `${baseId}:tool:${toolEvent.id}`,
    text,
    toolCallDisplayText: text,
    toolCallDetails: displayToolCallDetails,
    correlationId: correlationId ?? null,
    sourceEventType: toolEvent.kind,
    sourceChannel: sdkCurrentTurnSourceChannel,
    turnRef: turnRef || undefined,
  });
}

function buildProjectedToolOutputMessage({
  baseId,
  turnRef,
  toolEvent,
}) {
  const toolOutputDetails = asObject(toolEvent.toolOutputDetails) || {};
  const displayToolOutputDetails = sanitizeSdkToolDetailRecord(toolOutputDetails);
  const toolName = readString(toolEvent.toolName);
  const requestId = readString(toolEvent.requestId);
  const correlationId = (
    readString(toolEvent.correlationId)
    || requestId
    || undefined
  );
  const attachments = readSdkDisplayAttachments(toolEvent.attachments);
  const outputText = normalizeText(toolEvent.text)
    || (toolName ? `${toolName} completed` : 'Tool completed');
  return buildToolOutputChatMessageState({
    id: `${baseId}:tool:${toolEvent.id}`,
    outputText,
    sourceEventType: toolEvent.kind,
    sourceChannel: sdkCurrentTurnSourceChannel,
    attachments,
    toolMetadata: asObject(toolEvent.toolMetadata),
    toolName,
    executionTime: typeof toolEvent.executionTime === 'number' ? toolEvent.executionTime : null,
    success: typeof toolEvent.success === 'boolean' ? toolEvent.success : null,
    correlationId,
    toolOutputDetails: displayToolOutputDetails,
    turnRef: turnRef || null,
    modelId: null,
    modelProvider: null,
  });
}

function buildProjectedToolProgressMessage({
  baseId,
  turnRef,
  toolEvent,
}) {
  const text = typeof toolEvent?.text === 'string' && toolEvent.text.trim()
    ? toolEvent.text
    : (typeof toolEvent?.toolName === 'string' ? toolEvent.toolName : '');
  if (!text) {
    return null;
  }
  return {
    id: `${baseId}:tool:${toolEvent.id}`,
    text,
    sender: 'assistant',
    type: 'search-source',
    sourceEventType: toolEvent.kind,
    sourceChannel: sdkCurrentTurnSourceChannel,
    turnRef: turnRef || undefined,
    toolName: toolEvent.toolName || undefined,
    success: toolEvent.status === 'success' ? true : undefined,
    toolMetadata: toolEvent.toolMetadata || null,
  };
}

function buildProjectedToolMessage({ baseId, turnRef, toolEvent }) {
  if (toolEvent.kind === 'tool_output') {
    return buildProjectedToolOutputMessage({ baseId, turnRef, toolEvent });
  }
  if (toolEvent.kind === 'tool_progress') {
    return buildProjectedToolProgressMessage({ baseId, turnRef, toolEvent });
  }
  return buildProjectedToolCallMessage({ baseId, turnRef, toolEvent });
}

function hasPresentationObject(sdkLiveTurn) {
  return Boolean(asRecord(sdkLiveTurn?.presentation));
}

function buildLegacyNoPresentationCurrentTurnMessages(sdkLiveTurn) {
  if (!sdkLiveTurn || typeof sdkLiveTurn !== 'object') {
    return [];
  }
  if (hasPresentationObject(sdkLiveTurn)) {
    return [];
  }
  const {
    conversationRef,
    turnRef,
    phase,
    assistantText,
    reasoningText,
    toolEvents,
    lastError,
  } = sdkLiveTurn;
  const hasText = typeof assistantText === 'string' && assistantText.trim();
  const hasReasoning = typeof reasoningText === 'string' && reasoningText.trim();
  const hasError = typeof lastError === 'string' && lastError.trim();
  const hasToolEvents = Array.isArray(toolEvents) && toolEvents.length > 0;
  if (phase === 'idle' && !hasText && !hasReasoning && !hasError && !hasToolEvents) {
    return [];
  }

  const baseId = `${conversationRef || 'conversation'}:${turnRef || 'turn'}`;
  const messages = [{
    id: `${baseId}:user-marker`,
    text: '',
    sender: 'user',
    turnRef: turnRef || undefined,
    sourceEventType: 'sdk-current-turn',
    sourceChannel: sdkCurrentTurnSourceChannel,
  }];

  if (hasReasoning && !hasText) {
    messages.push({
      id: `${baseId}:thinking`,
      text: '',
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: reasoningText,
      sourceEventType: 'reasoning_delta',
      sourceChannel: sdkCurrentTurnSourceChannel,
      turnRef: turnRef || undefined,
      isComplete: false,
    });
  }

  if (hasToolEvents) {
    toolEvents.forEach((toolEvent, index) => {
      const projectedToolEvent = {
        ...toolEvent,
        id: toolEvent.id || index,
      };
      const message = buildProjectedToolMessage({ baseId, turnRef, toolEvent: projectedToolEvent });
      if (message) {
        messages.push(message);
      }
    });
  }

  if (hasText) {
    messages.push({
      id: `${baseId}:assistant`,
      text: assistantText,
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: hasReasoning ? reasoningText : null,
      sourceEventType: 'assistant_delta',
      sourceChannel: sdkCurrentTurnSourceChannel,
      turnRef: turnRef || undefined,
      isComplete: phase === 'complete',
    });
  }

  if (hasError) {
    messages.push({
      id: `${baseId}:error`,
      text: lastError,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'runtime_error',
      sourceChannel: sdkCurrentTurnSourceChannel,
      turnRef: turnRef || undefined,
      isComplete: true,
    });
  }

  return messages;
}

function buildBaseMessageFields(entry, liveTurnContext) {
  return {
    id: entry.id,
    sourceEventType: entry.sourceEventType || null,
    sourceChannel: entry.sourceChannel || sdkCurrentTurnSourceChannel,
    turnRef: entry.turnRef || liveTurnContext?.turnRef || undefined,
    modelId: entry.modelId || null,
    modelProvider: entry.modelProvider || null,
    isComplete: entry.isComplete === true,
  };
}

function buildThinkingMessage(entry, liveTurnContext) {
  const thinkingText = normalizeText(entry.text);
  if (!thinkingText) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, liveTurnContext),
    text: '',
    sender: 'assistant',
    type: 'llm-text',
    thinkingText,
    thinkingSourceEventType: entry.sourceEventType || 'reasoning_delta',
    isComplete: false,
  };
}

function buildAssistantTextMessage(entry, liveTurnContext) {
  const text = normalizeText(entry.text);
  if (!text) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, liveTurnContext),
    text,
    sender: 'assistant',
    type: 'llm-text',
  };
}

function buildErrorMessage(entry, liveTurnContext) {
  const text = normalizeText(entry.text);
  if (!text) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, liveTurnContext),
    text,
    sender: 'assistant',
    type: 'error',
    isComplete: true,
  };
}

function buildToolCallMessage(entry, liveTurnContext) {
  const toolName = normalizeOptionalText(entry.toolName);
  const text = normalizeText(entry.text);
  const toolDetails = asRecord(entry.toolCallDetails);
  const displayToolDetails = sanitizeSdkToolDetailRecord(toolDetails);
  const displayText = text || (toolName ? `Using ${toolName}` : 'Using tool');

  return buildToolCallChatMessageState({
    ...buildBaseMessageFields(entry, liveTurnContext),
    text: displayText,
    toolCallDisplayText: displayText,
    toolCallDetails: displayToolDetails,
    correlationId: normalizeOptionalText(entry.correlationId),
  });
}

function buildToolProgressMessage(entry, liveTurnContext) {
  const text = normalizeText(entry.text) || normalizeOptionalText(entry.toolName);
  if (!text) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, liveTurnContext),
    text,
    sender: 'assistant',
    type: 'search-source',
    toolName: entry.toolName || undefined,
    toolMetadata: entry.toolMetadata || null,
  };
}

function buildToolOutputMessage(entry, liveTurnContext) {
  const toolDetails = asRecord(entry.toolOutputDetails);
  const displayToolDetails = sanitizeSdkToolDetailRecord(toolDetails);
  const toolName = normalizeOptionalText(entry.toolName);
  const text = normalizeText(entry.text) || (toolName ? `${toolName} completed` : 'Tool completed');
  const attachments = readSdkDisplayAttachments(entry.attachments);
  return buildToolOutputChatMessageState({
    id: entry.id,
    outputText: text,
    sourceEventType: entry.sourceEventType || 'tool_output',
    sourceChannel: entry.sourceChannel || sdkCurrentTurnSourceChannel,
    attachments,
    toolMetadata: asRecord(entry.toolMetadata),
    toolName,
    executionTime: typeof entry.executionTime === 'number' ? entry.executionTime : null,
    success: typeof entry.success === 'boolean' ? entry.success : null,
    correlationId: normalizeOptionalText(entry.correlationId),
    toolOutputDetails: displayToolDetails,
    turnRef: entry.turnRef || liveTurnContext?.turnRef || null,
    modelId: entry.modelId || null,
    modelProvider: entry.modelProvider || null,
    isComplete: entry.isComplete === true,
  });
}

function buildChatMessageFromLiveTurnEntry(entry, liveTurnContext = null) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
    return null;
  }
  const type = normalizeEntryType(entry.type);
  if (type === 'thinking') {
    return buildThinkingMessage(entry, liveTurnContext);
  }
  if (type === 'tool-call' || type === 'tool-explanation') {
    return buildToolCallMessage(entry, liveTurnContext);
  }
  if (type === 'tool-progress' || type === 'search-source') {
    return buildToolProgressMessage(entry, liveTurnContext);
  }
  if (type === 'tool-output') {
    return buildToolOutputMessage(entry, liveTurnContext);
  }
  if (type === 'error') {
    return buildErrorMessage(entry, liveTurnContext);
  }
  return buildAssistantTextMessage(entry, liveTurnContext);
}

function buildCurrentTurnMessagesFromPresentation(sdkLiveTurn = null) {
  const entries = Array.isArray(sdkLiveTurn?.presentation?.entries)
    ? sdkLiveTurn.presentation.entries
    : [];
  if (entries.length === 0) {
    return [];
  }
  return entries
    .map((entry) => buildChatMessageFromLiveTurnEntry(entry, sdkLiveTurn))
    .filter(Boolean);
}

function buildNoViewSdkLiveTurnMessages(sdkLiveTurn = null) {
  const presentationMessages = buildCurrentTurnMessagesFromPresentation(sdkLiveTurn);
  if (presentationMessages.length > 0) {
    return presentationMessages;
  }
  if (hasPresentationObject(sdkLiveTurn)) {
    return [];
  }
  return buildLegacyNoPresentationCurrentTurnMessages(sdkLiveTurn);
}

function buildConversationViewLiveTurnMessages(conversationView = null) {
  const entries = Array.isArray(conversationView?.liveTurn?.entries)
    ? conversationView.liveTurn.entries
    : [];
  if (entries.length === 0) {
    return [];
  }
  const liveTurnContext = {
    conversationRef: conversationView?.conversationRef || null,
    turnRef: conversationView?.liveTurn?.turnRef || null,
  };
  return entries
    .map((entry) => buildChatMessageFromLiveTurnEntry({
      ...entry,
      sourceChannel: sdkConversationViewSourceChannel,
    }, liveTurnContext))
    .filter(Boolean);
}

function buildSdkLiveTurnMessages({
  conversationView = null,
  sdkLiveTurn = null,
} = {}) {
  const conversationViewMessages = buildConversationViewLiveTurnMessages(conversationView);
  if (conversationViewMessages.length > 0) {
    return conversationViewMessages;
  }
  if (conversationView && typeof conversationView === 'object') {
    return [];
  }
  return buildNoViewSdkLiveTurnMessages(sdkLiveTurn);
}

function isResponseCloseable(response) {
  if (!response) {
    return false;
  }
  if (response.type === 'error') {
    return true;
  }
  return Boolean(response.isComplete);
}

const RESPONSE_OVERLAY_VISIBLE_MESSAGE_TYPES = new Set([
  'tool-call',
  'tool-output',
  'search-source',
  'tool-explanation',
  'error',
]);

const RESPONSE_OVERLAY_PROGRESS_MESSAGE_TYPES = new Set([
  'tool-call',
  'tool-output',
  'search-source',
  'tool-explanation',
]);

function isVisibleResponseOverlayMessage(message) {
  return Boolean(
    message
    && message.sender === 'assistant'
    && (
      normalizeText(message.text)
      || normalizeText(message.thinkingText)
      || RESPONSE_OVERLAY_VISIBLE_MESSAGE_TYPES.has(message.type)
    )
  );
}

function isResponseOverlayProgressMessage(message) {
  return Boolean(
    message
    && RESPONSE_OVERLAY_PROGRESS_MESSAGE_TYPES.has(message.type),
  );
}

function isResponseOverlaySourceTaggedMessage(message) {
  return Boolean(
    message
    && (
      message.type === 'llm-text'
      || message.type === 'error'
      || normalizeOptionalText(message.sourceEventType)
    ),
  );
}

export const DesktopCurrentTurnMessageRuntime = Object.freeze({
  buildConversationViewLiveTurnMessages,
  buildCurrentTurnMessagesFromPresentation,
  buildLegacyNoPresentationCurrentTurnMessages,
  buildNoViewSdkLiveTurnMessages,
  buildSdkLiveTurnMessages,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
  isVisibleResponseOverlayMessage,
  resolveNoViewSdkLiveTurnThinkingText,
});
