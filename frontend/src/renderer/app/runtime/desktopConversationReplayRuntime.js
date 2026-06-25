/**
 * Provides renderer conversation replay projection helpers.
 */

import { DesktopConversationRuntimeContracts } from './desktopConversationRuntimeContracts';

const {
  resolveCorrelationId,
  resolveToolBundleCorrelationId,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} = DesktopConversationRuntimeContracts;

const TOOL_CALL_MESSAGE_TYPES = new Set(['tool-call', 'tool-bundle']);
const TOOL_OUTPUT_MESSAGE_TYPES = new Set(['tool-output']);

function normalizeReplayMessageType(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }
  return typeof message.type === 'string'
    ? message.type.trim().toLowerCase()
    : '';
}

function resolveReplayToolMessageCorrelationId(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }
  const messageType = normalizeReplayMessageType(message);
  const toolCallDetailsId = (
    message.toolCallDetails
    && typeof message.toolCallDetails === 'object'
    && !Array.isArray(message.toolCallDetails)
    && typeof message.toolCallDetails.id === 'string'
      ? message.toolCallDetails.id
      : null
  );
  const toolOutputDetailsId = (
    message.toolOutputDetails
    && typeof message.toolOutputDetails === 'object'
    && !Array.isArray(message.toolOutputDetails)
    && typeof message.toolOutputDetails.id === 'string'
      ? message.toolOutputDetails.id
      : null
  );
  const sdkResolvedId = messageType === 'tool-bundle'
    ? resolveToolBundleCorrelationId(message.toolCallDetails)
    : (
        messageType === 'tool-output'
          ? resolveToolOutputCorrelationId(message.toolOutputDetails)
          : resolveToolCallCorrelationId(message.toolCallDetails)
      );
  return resolveCorrelationId(
    message.correlationId,
    sdkResolvedId,
    toolCallDetailsId,
    toolOutputDetailsId,
    message?.modelFacingToolCall?.id,
  );
}

function isReplayToolCallMessage(message) {
  return TOOL_CALL_MESSAGE_TYPES.has(normalizeReplayMessageType(message));
}

function isReplayToolOutputMessage(message) {
  return TOOL_OUTPUT_MESSAGE_TYPES.has(normalizeReplayMessageType(message));
}

function isReplayUserMessage(message) {
  return message?.sender === 'user';
}

function isReplayAssistantMessage(message) {
  return message?.sender === 'assistant';
}

function findReplayEditableUserMessageIndex(messages, userMessageId) {
  if (!Array.isArray(messages) || typeof userMessageId !== 'string' || !userMessageId) {
    return -1;
  }
  return messages.findIndex(
    (message) => message?.id === userMessageId && isReplayUserMessage(message),
  );
}

function resolveReplayRetryMessageIndexes(messages, assistantMessageId) {
  if (!Array.isArray(messages) || typeof assistantMessageId !== 'string' || !assistantMessageId) {
    return { assistantIndex: -1, userIndex: -1 };
  }
  const assistantIndex = messages.findIndex(
    (message) => message?.id === assistantMessageId && isReplayAssistantMessage(message),
  );
  if (assistantIndex < 0) {
    return { assistantIndex: -1, userIndex: -1 };
  }
  for (let index = assistantIndex; index >= 0; index -= 1) {
    if (isReplayUserMessage(messages[index])) {
      return { assistantIndex, userIndex: index };
    }
  }
  return { assistantIndex, userIndex: -1 };
}

function findMatchingPendingToolCallIndex(pendingCalls, outputCorrelationId) {
  if (!Array.isArray(pendingCalls) || pendingCalls.length === 0) {
    return -1;
  }

  if (outputCorrelationId) {
    const sameIdIndex = pendingCalls.findIndex((entry) => entry.correlationId === outputCorrelationId);
    if (sameIdIndex >= 0) {
      return sameIdIndex;
    }
    const idlessIndex = pendingCalls.findIndex((entry) => !entry.correlationId);
    if (idlessIndex >= 0) {
      return idlessIndex;
    }
    return -1;
  }

  const idlessIndex = pendingCalls.findIndex((entry) => !entry.correlationId);
  if (idlessIndex >= 0) {
    return idlessIndex;
  }
  return -1;
}

function buildReplayContextMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const pendingToolCalls = [];
  const keepToolMessageIndexes = new Set();

  messages.forEach((message, index) => {
    if (isReplayToolCallMessage(message)) {
      pendingToolCalls.push({
        index,
        correlationId: resolveReplayToolMessageCorrelationId(message),
      });
      return;
    }
    if (!isReplayToolOutputMessage(message)) {
      return;
    }
    const outputCorrelationId = resolveReplayToolMessageCorrelationId(message);
    const pendingIndex = findMatchingPendingToolCallIndex(
      pendingToolCalls,
      outputCorrelationId,
    );
    if (pendingIndex < 0) {
      return;
    }
    const [matchedCall] = pendingToolCalls.splice(pendingIndex, 1);
    keepToolMessageIndexes.add(matchedCall.index);
    keepToolMessageIndexes.add(index);
  });

  return messages.filter((message, index) => {
    if (!isReplayToolCallMessage(message) && !isReplayToolOutputMessage(message)) {
      return true;
    }
    return keepToolMessageIndexes.has(index);
  });
}

function buildReplayPendingTurn({
  attachmentFilenames = null,
  conversationRef,
  text,
  timestamp,
  turnRef,
  userMessageId,
}) {
  const normalizedUserMessageId = typeof userMessageId === 'string' && userMessageId.trim()
    ? userMessageId.trim()
    : `${turnRef}-sdk-evt-000002-user_message`;
  return {
    conversationRef,
    turnRef,
    userMessageId: normalizedUserMessageId,
    text,
    timestamp,
    attachmentFilenames: Array.isArray(attachmentFilenames) && attachmentFilenames.length > 0
      ? attachmentFilenames
      : null,
  };
}

function buildReplayPendingUserMessage(pendingTurn) {
  if (!pendingTurn || typeof pendingTurn !== 'object') {
    return null;
  }
  return {
    id: pendingTurn.userMessageId,
    text: pendingTurn.text,
    sender: 'user',
    turnRef: pendingTurn.turnRef,
    sourceEventType: 'renderer-compose',
    sourceChannel: 'renderer-local',
    isComplete: true,
    timestamp: pendingTurn.timestamp,
    attachmentFilenames: pendingTurn.attachmentFilenames,
    attachments: null,
  };
}

function buildReplayMessagesWithPendingTurn(messages, pendingTurn) {
  const replayMessages = Array.isArray(messages) ? messages : [];
  const pendingUserMessage = buildReplayPendingUserMessage(pendingTurn);
  if (!pendingUserMessage?.id) {
    return replayMessages;
  }
  const existingMessageIndex = replayMessages.findIndex(
    (message) => message?.id === pendingUserMessage.id,
  );
  if (existingMessageIndex < 0) {
    return [...replayMessages, pendingUserMessage];
  }
  return replayMessages.map((message, index) => (
    index === existingMessageIndex
      ? { ...message, ...pendingUserMessage }
      : message
  ));
}

export const DesktopConversationReplayRuntime = Object.freeze({
  buildReplayMessagesWithPendingTurn,
  buildReplayPendingTurn,
  buildReplayContextMessages,
  findReplayEditableUserMessageIndex,
  resolveReplayRetryMessageIndexes,
});
