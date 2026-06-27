/**
 * Builds visible thread messages from durable rows plus SDK current-turn rows.
 */

import {
  DesktopCurrentTurnMessageRuntime,
} from './desktopCurrentTurnMessageRuntime';
import { DesktopPresentationSourceChannels } from './desktopPresentationSourceChannels';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

const {
  buildSdkLiveTurnMessages,
} = DesktopCurrentTurnMessageRuntime;
const {
  isSdkDisplayRowsSourceChannel,
  isSdkLiveTurnSourceChannel,
} = DesktopPresentationSourceChannels;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

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

function readExactRef(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function isRendererPendingBridgeMessage(message) {
  return (
    message?.sender === 'user'
    && message?.sourceChannel === 'renderer-local'
    && message?.sourceEventType === 'renderer-compose'
  );
}

function isConversationViewBaseMessage(message) {
  return (
    isSdkDisplayRowsSourceChannel(message?.sourceChannel)
    || isRendererPendingBridgeMessage(message)
  );
}

function isTextlessCurrentTurnThinkingMessage(message) {
  return (
    isSdkLiveTurnSourceChannel(message?.sourceChannel)
    && message?.sender === 'assistant'
    && (!message.type || message.type === 'llm-text')
    && !normalizeText(message.text)
    && normalizeText(message.thinkingText)
  );
}

function isVisibleCurrentTurnMessage(message) {
  return (
    isSdkLiveTurnSourceChannel(message?.sourceChannel)
    && message?.sender === 'assistant'
    && (
      normalizeText(message.text)
      || normalizeText(message.thinkingText)
      || message.type === 'tool-output'
      || message.type === 'tool-call'
      || message.type === 'tool-progress'
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
  const leftTurnRef = readExactRef(left);
  const rightTurnRef = readExactRef(right);
  return Boolean(leftTurnRef && rightTurnRef && leftTurnRef === rightTurnRef);
}

function messageTypesMatch(left, right) {
  return (left || 'llm-text') === (right || 'llm-text');
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function stringField(record, ...keys) {
  for (const key of keys) {
    const value = readExactRef(record?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function identityFromToolRecord(record) {
  const metadata = asRecord(record?.metadata);
  return stringField(
    record,
    'displayCorrelationId',
    'toolCallId',
    'tool_call_id',
    'id',
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'correlationId',
    'correlation_id',
  ) ?? stringField(
    metadata,
    'displayCorrelationId',
    'toolCallId',
    'tool_call_id',
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'correlationId',
    'correlation_id',
  );
}

function toolMessageIdentity(message) {
  return readExactRef(message?.correlationId)
    || identityFromToolRecord(asRecord(message?.toolCallDetails))
    || identityFromToolRecord(asRecord(message?.toolOutputDetails));
}

function hasMaterializedDuplicateForLiveMessage(messages, liveMessage) {
  const liveId = readExactRef(liveMessage?.id);
  const liveText = normalizeText(liveMessage?.text);
  const liveThinkingText = normalizeText(liveMessage?.thinkingText);
  return messages.some((message) => {
    if (!message || isSdkLiveTurnSourceChannel(message.sourceChannel)) {
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
    const liveToolIdentity = toolMessageIdentity(liveMessage);
    if (liveToolIdentity) {
      return toolMessageIdentity(message) === liveToolIdentity;
    }
    const materializedText = normalizeText(message.text);
    return Boolean(liveText && materializedText && materializedText === liveText);
  });
}

function resolveCurrentTurnMessages({
  sdkLiveTurn = null,
  conversationView = null,
}) {
  return buildSdkLiveTurnMessages({
    conversationView,
    sdkLiveTurn,
  });
}

function selectVisibleCurrentTurnMessages({
  messages,
  liveTurnMessages,
  projectionConversationRefValue,
  activeConversationRef,
}) {
  if (!Array.isArray(liveTurnMessages) || liveTurnMessages.length === 0) {
    return [];
  }
  const hasProjectionConversationRef = projectionConversationRefValue !== null
    && projectionConversationRefValue !== undefined;
  const hasActiveConversationRef = activeConversationRef !== null
    && activeConversationRef !== undefined;
  const projectionConversationRef = readExactRef(projectionConversationRefValue);
  const normalizedActiveConversationRef = readExactRef(activeConversationRef);
  if (
    (hasProjectionConversationRef && !projectionConversationRef)
    || (hasActiveConversationRef && !normalizedActiveConversationRef)
  ) {
    return [];
  }
  if (
    projectionConversationRef
    && normalizedActiveConversationRef
    && projectionConversationRef !== normalizedActiveConversationRef
  ) {
    return [];
  }
  return liveTurnMessages.filter((message) => (
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
  const liveTurnRef = readExactRef(liveMessages[0]?.turnRef);
  if (liveTurnRef) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (readExactRef(messages[index]?.turnRef) === liveTurnRef) {
        return index + 1;
      }
    }
  }
  const lastUserIndex = findLastUserIndex(messages);
  return lastUserIndex >= 0 ? lastUserIndex + 1 : messages.length;
}

function buildThreadPresentationMessages(
  messages,
  {
    sdkLiveTurn = null,
    conversationView = null,
    activeConversationRef = null,
  } = {},
) {
  const hasConversationView = hasWorkspaceConversationView({ conversationView });
  const effectiveConversationView = hasConversationView ? conversationView : null;
  const inputMessages = Array.isArray(messages) ? messages : [];
  const baseMessages = hasConversationView
    ? inputMessages.filter(isConversationViewBaseMessage)
    : inputMessages;
  const resolvedCurrentTurnMessages = resolveCurrentTurnMessages({
    sdkLiveTurn,
    conversationView: effectiveConversationView,
  });
  const projectionConversationRefValue = hasConversationView
    ? effectiveConversationView?.conversationRef
    : sdkLiveTurn?.conversationRef;
  const liveMessages = selectVisibleCurrentTurnMessages({
    messages: baseMessages,
    liveTurnMessages: resolvedCurrentTurnMessages,
    projectionConversationRefValue,
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

export const DesktopThreadPresentationRuntime = Object.freeze({
  buildThreadPresentationMessages,
});
