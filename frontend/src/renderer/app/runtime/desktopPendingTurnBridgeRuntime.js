/**
 * Builds the renderer-local pending-turn bridge row.
 */

function readExactIdentityString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function buildPendingTurn({
  conversationRef,
  text,
  timestamp,
  turnRef,
  userMessageId = null,
}) {
  const normalizedConversationRef = readExactIdentityString(conversationRef);
  const normalizedTurnRef = readExactIdentityString(turnRef);
  const normalizedText = typeof text === 'string' ? text : null;
  const normalizedTimestamp = typeof timestamp === 'string' && timestamp.trim()
    ? timestamp
    : null;
  if (!normalizedConversationRef || !normalizedTurnRef || normalizedText === null || !normalizedTimestamp) {
    return null;
  }
  const hasExplicitUserMessageId = userMessageId !== null && userMessageId !== undefined;
  const normalizedUserMessageId = hasExplicitUserMessageId
    ? readExactIdentityString(userMessageId)
    : `${normalizedTurnRef}-sdk-evt-000002-user_message`;
  if (!normalizedUserMessageId) {
    return null;
  }
  return {
    conversationRef: normalizedConversationRef,
    turnRef: normalizedTurnRef,
    userMessageId: normalizedUserMessageId,
    text: normalizedText,
    timestamp: normalizedTimestamp,
  };
}

function buildPendingTurnUserMessage(pendingTurn) {
  if (!pendingTurn || typeof pendingTurn !== 'object') {
    return null;
  }
  const normalizedPendingTurn = buildPendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return null;
  }
  return {
    id: normalizedPendingTurn.userMessageId,
    text: normalizedPendingTurn.text,
    sender: 'user',
    turnRef: normalizedPendingTurn.turnRef,
    sourceEventType: 'renderer-compose',
    sourceChannel: 'renderer-local',
    isComplete: true,
    timestamp: normalizedPendingTurn.timestamp,
    attachments: null,
  };
}

export const DesktopPendingTurnBridgeRuntime = Object.freeze({
  buildPendingTurn,
  buildPendingTurnUserMessage,
});
