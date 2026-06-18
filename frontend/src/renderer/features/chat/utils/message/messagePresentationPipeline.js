/**
 * Provides the message presentation pipeline module for the renderer UI.
 */

import { buildCurrentTurnMessagesFromPresentation } from './liveTurnPresentationMessages';
import { SDK_CURRENT_TURN_SOURCE_CHANNEL } from '../../../../app/runtime/desktopPresentationSourceChannels';

function findLastUserIndex(messages) {
  if (!Array.isArray(messages)) {
    return -1;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender === 'user') {
      return index;
    }
  }
  return -1;
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function normalizeRef(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function hasCurrentTurnLiveProgressMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  const lastUserIndex = findLastUserIndex(messages);
  const lowerBound = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;

  for (let index = lowerBound; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      message?.type === 'tool-output'
      || message?.type === 'tool-call'
      || message?.type === 'tool-bundle'
      || message?.type === 'tool-explanation'
      || message?.type === 'search-source'
    ) {
      return true;
    }
  }

  return false;
}

function isTextlessCurrentTurnThinkingMessage(message) {
  return (
    message?.sourceChannel === SDK_CURRENT_TURN_SOURCE_CHANNEL
    && message?.sender === 'assistant'
    && (!message.type || message.type === 'llm-text')
    && !normalizeText(message.text)
    && normalizeText(message.thinkingText)
  );
}

function isVisibleCurrentTurnMessage(message) {
  return (
    message?.sourceChannel === SDK_CURRENT_TURN_SOURCE_CHANNEL
    && message?.sender === 'assistant'
    && (
      normalizeText(message.text)
      || normalizeText(message.thinkingText)
      || message.type === 'tool-output'
      || message.type === 'tool-call'
      || message.type === 'search-source'
      || message.type === 'tool-explanation'
      || message.type === 'error'
    )
  );
}

function hasMaterializedAssistantTextForTurn(messages, turnRef) {
  if (!turnRef) {
    return false;
  }
  return messages.some((message) => (
    message?.sender === 'assistant'
    && message?.turnRef === turnRef
    && (!message.type || message.type === 'llm-text')
    && normalizeText(message.text)
  ));
}

function belongsToLatestUserTurn(messages, message) {
  const lastUserIndex = findLastUserIndex(messages);
  if (lastUserIndex < 0) {
    return true;
  }
  const latestUserTurnRef = messages[lastUserIndex]?.turnRef;
  if (!latestUserTurnRef || !message?.turnRef) {
    return true;
  }
  return latestUserTurnRef === message.turnRef;
}

function sameTurnRef(left, right) {
  const leftTurnRef = normalizeRef(left);
  const rightTurnRef = normalizeRef(right);
  return Boolean(leftTurnRef && rightTurnRef && leftTurnRef === rightTurnRef);
}

function messageTypesMatch(left, right) {
  return (left || 'llm-text') === (right || 'llm-text');
}

function resolveToolName(message) {
  const candidates = [
    message?.toolName,
    message?.toolCallDetails?.toolName,
    message?.toolOutputDetails?.toolName,
    message?.modelFacingToolCall?.name,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeRef(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function hasMaterializedDuplicateForLiveMessage(messages, liveMessage) {
  const liveId = normalizeRef(liveMessage?.id);
  const liveText = normalizeText(liveMessage?.text);
  const liveThinkingText = normalizeText(liveMessage?.thinkingText);
  return messages.some((message) => {
    if (!message || message.sourceChannel === SDK_CURRENT_TURN_SOURCE_CHANNEL) {
      return false;
    }
    if (liveId && message.id === liveId) {
      return true;
    }
    if (!sameTurnRef(message.turnRef, liveMessage?.turnRef)) {
      return false;
    }
    if (liveMessage?.type === 'llm-text' || !liveMessage?.type) {
      if (message.sender !== 'assistant' || !messageTypesMatch(message.type, liveMessage?.type)) {
        return false;
      }
      const materializedText = normalizeText(message.text);
      if (liveText && materializedText && materializedText.startsWith(liveText)) {
        return true;
      }
      const materializedThinking = normalizeText(message.thinkingText);
      return Boolean(liveThinkingText && materializedThinking === liveThinkingText);
    }
    if (!messageTypesMatch(message.type, liveMessage?.type)) {
      return false;
    }
    if (liveMessage?.correlationId && message.correlationId === liveMessage.correlationId) {
      return true;
    }
    const liveToolName = resolveToolName(liveMessage);
    if (liveToolName && resolveToolName(message) === liveToolName) {
      return true;
    }
    const materializedText = normalizeText(message.text);
    return Boolean(liveText && materializedText && materializedText === liveText);
  });
}

function resolveCurrentTurnMessages({
  currentTurnMessages = [],
  currentTurnProjection = null,
}) {
  const presentationMessages = buildCurrentTurnMessagesFromPresentation(currentTurnProjection);
  if (presentationMessages.length > 0) {
    return presentationMessages;
  }
  return Array.isArray(currentTurnMessages) ? currentTurnMessages : [];
}

function selectVisibleCurrentTurnMessages({
  messages,
  currentTurnMessages,
  currentTurnProjection,
  activeConversationRef,
}) {
  if (!Array.isArray(currentTurnMessages) || currentTurnMessages.length === 0) {
    return [];
  }
  const projectionConversationRef = normalizeRef(currentTurnProjection?.conversationRef);
  const normalizedActiveConversationRef = normalizeRef(activeConversationRef);
  if (
    projectionConversationRef
    && normalizedActiveConversationRef
    && projectionConversationRef !== normalizedActiveConversationRef
  ) {
    return [];
  }
  return currentTurnMessages.filter((message) => (
    isVisibleCurrentTurnMessage(message)
    && belongsToLatestUserTurn(messages, message)
    && !(
      isTextlessCurrentTurnThinkingMessage(message)
      && hasMaterializedAssistantTextForTurn(messages, message.turnRef)
    )
    && !hasMaterializedDuplicateForLiveMessage(messages, message)
  ));
}

function resolveLiveMessageInsertIndex(messages, liveMessages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }
  const liveTurnRef = normalizeRef(liveMessages[0]?.turnRef);
  if (liveTurnRef) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (normalizeRef(messages[index]?.turnRef) === liveTurnRef) {
        return index + 1;
      }
    }
  }
  const lastUserIndex = findLastUserIndex(messages);
  return lastUserIndex >= 0 ? lastUserIndex + 1 : messages.length;
}

export function buildThreadPresentationMessages(
  messages,
  {
    currentTurnMessages = [],
    currentTurnProjection = null,
    activeConversationRef = null,
  } = {},
) {
  const baseMessages = Array.isArray(messages) ? messages : [];
  const resolvedCurrentTurnMessages = resolveCurrentTurnMessages({
    currentTurnMessages,
    currentTurnProjection,
  });
  const liveMessages = selectVisibleCurrentTurnMessages({
    messages: baseMessages,
    currentTurnMessages: resolvedCurrentTurnMessages,
    currentTurnProjection,
    activeConversationRef,
  });
  if (liveMessages.length === 0) {
    return baseMessages;
  }

  const insertIndex = resolveLiveMessageInsertIndex(baseMessages, liveMessages);
  return [
    ...baseMessages.slice(0, insertIndex),
    ...liveMessages,
    ...baseMessages.slice(insertIndex),
  ];
}
