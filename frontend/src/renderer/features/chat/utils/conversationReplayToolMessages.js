import { resolveCorrelationId } from '../../../infrastructure/services/CorrelationId';

const TOOL_CALL_MESSAGE_TYPES = new Set(['tool-call', 'tool-bundle']);
const TOOL_OUTPUT_MESSAGE_TYPES = new Set(['tool-output', 'tool-result']);

function normalizeReplayMessageType(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }
  return typeof message.type === 'string'
    ? message.type.trim().toLowerCase()
    : '';
}

function pickCorrelationIdFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return resolveCorrelationId(
    payload.correlation_id,
    payload.request_id,
    payload.bundle_id,
    payload.id,
  );
}

export function resolveReplayToolMessageCorrelationId(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }
  return resolveCorrelationId(
    message.correlationId,
    pickCorrelationIdFromPayload(message.toolCallDetails),
    pickCorrelationIdFromPayload(message.toolOutputDetails),
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
  return 0;
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
