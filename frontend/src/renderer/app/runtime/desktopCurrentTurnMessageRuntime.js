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

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value : '';
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readExactSdkString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function resolveEntryCorrelationId(entry) {
  return (
    readExactSdkString(entry.correlationId)
    || readExactSdkString(entry.requestId)
    || readExactSdkString(entry.bundleId)
    || null
  );
}

function resolveToolEventCorrelationId(toolEvent) {
  return (
    readExactSdkString(toolEvent.correlationId)
    || readExactSdkString(toolEvent.requestId)
    || readExactSdkString(toolEvent.bundleId)
    || null
  );
}

function resolveNoViewSdkLiveTurnThinkingText(sdkLiveTurn = null) {
  if (hasPresentationObject(sdkLiveTurn)) {
    return '';
  }
  return normalizeOptionalText(asRecord(sdkLiveTurn)?.reasoningText) || '';
}

function normalizeEntryType(value) {
  return readExactSdkString(value) || 'llm-text';
}

function resolveToolName(value) {
  return readExactSdkString(value);
}

function buildProjectedToolCallMessage({
  baseId,
  liveTurnRef,
  toolEvent,
}) {
  const toolName = resolveToolName(toolEvent.toolName) || '';
  const toolCallDetails = asObject(toolEvent.toolCallDetails);
  const displayToolCallDetails = sanitizeSdkToolDetailRecord(toolCallDetails);
  const correlationId = resolveToolEventCorrelationId(toolEvent);
  const text = normalizeText(toolEvent.text) || (toolName ? `Using ${toolName}` : 'Using tool');

  return buildToolCallChatMessageState({
    id: `${baseId}:tool:${toolEvent.id}`,
    text,
    toolCallDisplayText: text,
    toolCallDetails: displayToolCallDetails,
    correlationId: correlationId ?? null,
    sourceEventType: toolEvent.kind,
    sourceChannel: sdkCurrentTurnSourceChannel,
    turnRef: liveTurnRef || undefined,
  });
}

function buildProjectedToolOutputMessage({
  baseId,
  liveTurnRef,
  toolEvent,
}) {
  const toolOutputDetails = asObject(toolEvent.toolOutputDetails);
  const displayToolOutputDetails = sanitizeSdkToolDetailRecord(toolOutputDetails);
  const toolName = resolveToolName(toolEvent.toolName);
  const correlationId = resolveToolEventCorrelationId(toolEvent);
  const outputText = normalizeText(toolEvent.text)
    || (toolName ? `${toolName} completed` : 'Tool completed');
  return buildToolOutputChatMessageState({
    id: `${baseId}:tool:${toolEvent.id}`,
    outputText,
    sourceEventType: toolEvent.kind,
    sourceChannel: sdkCurrentTurnSourceChannel,
    toolMetadata: asObject(toolEvent.toolMetadata),
    toolName,
    executionTime: typeof toolEvent.executionTime === 'number' ? toolEvent.executionTime : null,
    success: typeof toolEvent.success === 'boolean' ? toolEvent.success : null,
    correlationId,
    toolOutputDetails: displayToolOutputDetails,
    turnRef: liveTurnRef || null,
    modelId: null,
    modelProvider: null,
  });
}

function buildProjectedToolProgressMessage({
  baseId,
  liveTurnRef,
  toolEvent,
}) {
  const text = typeof toolEvent?.text === 'string' && toolEvent.text.trim()
    ? toolEvent.text
    : (resolveToolName(toolEvent?.toolName) || '');
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
    turnRef: liveTurnRef || undefined,
    toolName: resolveToolName(toolEvent.toolName) || undefined,
    success: toolEvent.status === 'success' ? true : undefined,
    toolMetadata: toolEvent.toolMetadata || null,
  };
}

function buildProjectedToolMessage({ baseId, liveTurnRef, toolEvent }) {
  if (toolEvent.kind === 'tool_output') {
    return buildProjectedToolOutputMessage({ baseId, liveTurnRef, toolEvent });
  }
  if (toolEvent.kind === 'tool_progress') {
    return buildProjectedToolProgressMessage({ baseId, liveTurnRef, toolEvent });
  }
  return buildProjectedToolCallMessage({ baseId, liveTurnRef, toolEvent });
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

  const liveConversationRef = readExactSdkString(conversationRef);
  if (!liveConversationRef) {
    return [];
  }
  const liveTurnRef = readExactSdkString(turnRef);
  const baseId = `${liveConversationRef}:${liveTurnRef || 'turn'}`;
  const messages = [{
    id: `${baseId}:user-marker`,
    text: '',
    sender: 'user',
    turnRef: liveTurnRef || undefined,
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
      turnRef: liveTurnRef || undefined,
      isComplete: false,
    });
  }

  if (hasToolEvents) {
    toolEvents.forEach((toolEvent, index) => {
      const projectedToolEvent = {
        ...toolEvent,
        id: toolEvent.id || index,
      };
      const message = buildProjectedToolMessage({
        baseId,
        liveTurnRef,
        toolEvent: projectedToolEvent,
      });
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
      turnRef: liveTurnRef || undefined,
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
      turnRef: liveTurnRef || undefined,
      isComplete: true,
    });
  }

  return messages;
}

function buildBaseMessageFields(entry, liveTurnContext) {
  return {
    id: entry.id,
    sourceEventType: readExactSdkString(entry.sourceEventType),
    sourceChannel: liveTurnContext?.sourceChannel || sdkCurrentTurnSourceChannel,
    turnRef: readExactSdkString(liveTurnContext?.turnRef) || undefined,
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
    thinkingSourceEventType: readExactSdkString(entry.sourceEventType) || 'reasoning_delta',
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
  const toolName = resolveToolName(entry.toolName);
  const text = normalizeText(entry.text);
  const displayText = text || (toolName ? `Using ${toolName}` : 'Using tool');

  return buildToolCallChatMessageState({
    ...buildBaseMessageFields(entry, liveTurnContext),
    text: displayText,
    toolCallDisplayText: displayText,
    toolCallDetails: sanitizeSdkToolDetailRecord(asRecord(entry.toolCallDetails)),
    correlationId: resolveEntryCorrelationId(entry),
  });
}

function buildToolProgressMessage(entry, liveTurnContext) {
  const text = normalizeText(entry.text) || resolveToolName(entry.toolName);
  if (!text) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, liveTurnContext),
    text,
    sender: 'assistant',
    type: 'search-source',
    toolName: resolveToolName(entry.toolName) || undefined,
    toolMetadata: entry.toolMetadata || null,
  };
}

function buildToolOutputMessage(entry, liveTurnContext) {
  const toolName = resolveToolName(entry.toolName);
  const text = normalizeText(entry.text) || (toolName ? `${toolName} completed` : 'Tool completed');
  const attachments = readSdkDisplayAttachments(entry.attachments);
  return buildToolOutputChatMessageState({
    id: entry.id,
    outputText: text,
    sourceEventType: readExactSdkString(entry.sourceEventType) || 'tool_output',
    sourceChannel: liveTurnContext?.sourceChannel || sdkCurrentTurnSourceChannel,
    attachments,
    toolMetadata: asRecord(entry.toolMetadata),
    toolName,
    executionTime: typeof entry.executionTime === 'number' ? entry.executionTime : null,
    success: typeof entry.success === 'boolean' ? entry.success : null,
    correlationId: resolveEntryCorrelationId(entry),
    toolOutputDetails: sanitizeSdkToolDetailRecord(asRecord(entry.toolOutputDetails)),
    turnRef: readExactSdkString(liveTurnContext?.turnRef),
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
    conversationRef: readExactSdkString(conversationView?.conversationRef),
    turnRef: readExactSdkString(conversationView?.liveTurn?.turnRef),
    sourceChannel: sdkConversationViewSourceChannel,
  };
  return entries
    .map((entry) => buildChatMessageFromLiveTurnEntry(entry, liveTurnContext))
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
  buildNoViewSdkLiveTurnMessages,
  buildSdkLiveTurnMessages,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
  isVisibleResponseOverlayMessage,
  resolveNoViewSdkLiveTurnThinkingText,
});
