/**
 * Provides the conversation replay tool messages module for the renderer UI.
 */

import {
  resolveCorrelationId,
  resolveToolBundleCorrelationId,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} from '../../../infrastructure/api/windieSdkClient';

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

export function buildReplayContextMessages(messages) {
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
