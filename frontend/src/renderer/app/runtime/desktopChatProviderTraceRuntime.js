/**
 * Builds chat-provider trace snapshots from renderer workspace read models.
 */

function normalizeTraceString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function traceLastMessageFromReadModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return {
    sender: value.sender ?? null,
    type: value.type || null,
    textLength: typeof value.textLength === 'number' ? value.textLength : 0,
    turnRef: normalizeTraceString(value.turnRef),
    sourceEventType: normalizeTraceString(value.sourceEventType),
  };
}

function traceConversationViewSummaryFromReadModel(workspace) {
  const value = workspace?.conversationViewTraceSummary;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function resolveTraceLastMessage(workspace, conversationViewTraceSummary) {
  if (conversationViewTraceSummary) {
    return traceLastMessageFromReadModel(conversationViewTraceSummary.lastMessage);
  }
  return traceLastMessageFromReadModel(workspace?.lastMessage);
}

function resolveTraceActiveTurnRef(workspace, conversationViewTraceSummary) {
  if (conversationViewTraceSummary) {
    return normalizeTraceString(conversationViewTraceSummary.liveTurnRef);
  }
  return normalizeTraceString(workspace?.activeTurnRef);
}

function resolveTraceMessageCount(workspace, conversationViewTraceSummary) {
  if (conversationViewTraceSummary) {
    return typeof conversationViewTraceSummary.displayRowCount === 'number'
      ? conversationViewTraceSummary.displayRowCount
      : 0;
  }
  return typeof workspace?.messageCount === 'number' ? workspace.messageCount : 0;
}

function buildChatProviderTraceWorkspaceSnapshot({
  activeConversationRef = null,
  workspace = null,
} = {}) {
  const conversationViewTraceSummary = traceConversationViewSummaryFromReadModel(workspace);
  return {
    activeConversationRef: normalizeTraceString(activeConversationRef),
    workspaceMessageCount: resolveTraceMessageCount(workspace, conversationViewTraceSummary),
    activeTurnRef: resolveTraceActiveTurnRef(workspace, conversationViewTraceSummary),
    lastMessage: resolveTraceLastMessage(workspace, conversationViewTraceSummary),
  };
}

export const DesktopChatProviderTraceRuntime = Object.freeze({
  buildChatProviderTraceWorkspaceSnapshot,
});
