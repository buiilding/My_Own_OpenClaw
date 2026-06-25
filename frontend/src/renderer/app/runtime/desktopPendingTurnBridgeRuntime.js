/**
 * Builds the renderer-local pending-turn bridge row.
 */

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
    attachmentFilenames: pendingTurn.attachmentFilenames,
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
  buildPendingTurnUserMessage,
  mergePendingTurnUserMessage,
});
