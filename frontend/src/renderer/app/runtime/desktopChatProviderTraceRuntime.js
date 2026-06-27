/**
 * Builds chat-provider trace snapshots from renderer workspace read models.
 */

function normalizeTraceString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveTraceTextLength(value) {
  return typeof value === 'string' ? value.length : 0;
}

function hasConversationView(workspace) {
  return Boolean(workspace?.conversationView && typeof workspace.conversationView === 'object');
}

function resolveConversationViewRows(workspace) {
  return Array.isArray(workspace?.conversationView?.displayRows)
    ? workspace.conversationView.displayRows
    : [];
}

function resolveLatestConversationViewRow(conversationView) {
  const displayRows = Array.isArray(conversationView?.displayRows)
    ? conversationView.displayRows
    : [];
  return displayRows[displayRows.length - 1] || null;
}

function resolveTraceLastMessage(workspace) {
  if (hasConversationView(workspace)) {
    const latestViewRow = resolveLatestConversationViewRow(workspace.conversationView);
    return latestViewRow ? {
      sender: normalizeTraceString(latestViewRow.role) || normalizeTraceString(latestViewRow.sender),
      type: normalizeTraceString(latestViewRow.type),
      textLength: resolveTraceTextLength(latestViewRow.content ?? latestViewRow.text),
      turnRef: normalizeTraceString(latestViewRow.turnRef),
      sourceEventType: normalizeTraceString(latestViewRow.sourceEventType),
    } : null;
  }
  const messages = Array.isArray(workspace?.messages) ? workspace.messages : [];
  const lastMessage = messages[messages.length - 1] || null;
  return lastMessage ? {
    sender: lastMessage.sender,
    type: lastMessage.type || null,
    textLength: typeof lastMessage.text === 'string' ? lastMessage.text.length : 0,
    turnRef: lastMessage.turnRef || null,
    sourceEventType: lastMessage.sourceEventType || null,
  } : null;
}

function resolveTraceActiveTurnRef(workspace) {
  if (hasConversationView(workspace)) {
    return normalizeTraceString(workspace?.conversationView?.liveTurn?.turnRef);
  }
  return (
    normalizeTraceString(workspace?.streamTracking?.activeTurnRef)
  );
}

function resolveTraceMessageCount(workspace) {
  if (hasConversationView(workspace)) {
    return resolveConversationViewRows(workspace).length;
  }
  const messages = Array.isArray(workspace?.messages) ? workspace.messages : [];
  return messages.length;
}

function buildChatProviderTraceWorkspaceSnapshot({
  activeConversationRef = null,
  workspace = null,
} = {}) {
  return {
    activeConversationRef,
    workspaceMessageCount: resolveTraceMessageCount(workspace),
    activeTurnRef: resolveTraceActiveTurnRef(workspace),
    lastMessage: resolveTraceLastMessage(workspace),
  };
}

export const DesktopChatProviderTraceRuntime = Object.freeze({
  buildChatProviderTraceWorkspaceSnapshot,
});
