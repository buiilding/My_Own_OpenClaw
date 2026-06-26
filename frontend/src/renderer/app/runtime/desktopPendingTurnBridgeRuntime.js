/**
 * Builds the renderer-local pending-turn bridge row.
 */

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildPendingTurn({
  conversationRef,
  text,
  timestamp,
  turnRef,
  userMessageId = null,
}) {
  const normalizedConversationRef = normalizeString(conversationRef);
  const normalizedTurnRef = normalizeString(turnRef);
  const normalizedText = typeof text === 'string' ? text : null;
  const normalizedTimestamp = typeof timestamp === 'string' && timestamp.trim()
    ? timestamp
    : null;
  if (!normalizedConversationRef || !normalizedTurnRef || normalizedText === null || !normalizedTimestamp) {
    return null;
  }
  const normalizedUserMessageId = normalizeString(userMessageId)
    || `${normalizedTurnRef}-sdk-evt-000002-user_message`;
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
  return {
    id: pendingTurn.userMessageId,
    text: pendingTurn.text,
    sender: 'user',
    turnRef: pendingTurn.turnRef,
    sourceEventType: 'renderer-compose',
    sourceChannel: 'renderer-local',
    isComplete: true,
    timestamp: pendingTurn.timestamp,
    attachments: null,
  };
}

function mergePendingTurnUserMessage(messages, pendingTurn) {
  const currentMessages = Array.isArray(messages) ? messages : [];
  const pendingUserMessage = buildPendingTurnUserMessage(pendingTurn);
  if (!pendingUserMessage?.id) {
    return currentMessages;
  }
  const existingMessageIndex = currentMessages.findIndex(
    (message) => message?.id === pendingUserMessage.id,
  );
  if (existingMessageIndex < 0) {
    return [...currentMessages, pendingUserMessage];
  }
  return currentMessages.map((message, index) => (
    index === existingMessageIndex
      ? { ...message, ...pendingUserMessage }
      : message
  ));
}

export const DesktopPendingTurnBridgeRuntime = Object.freeze({
  buildPendingTurn,
  buildPendingTurnUserMessage,
  mergePendingTurnUserMessage,
});
