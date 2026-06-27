/**
 * Builds chat-provider trace snapshots from renderer workspace read models.
 */

import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';

const {
  buildConversationViewTraceSummary,
} = DesktopConversationDisplayProjection;

function normalizeTraceString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasConversationView(workspace) {
  return Boolean(workspace?.conversationView && typeof workspace.conversationView === 'object');
}

function resolveTraceLastMessage(workspace) {
  if (hasConversationView(workspace)) {
    return buildConversationViewTraceSummary(workspace.conversationView).lastMessage;
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
    return buildConversationViewTraceSummary(workspace.conversationView).liveTurnRef;
  }
  return (
    normalizeTraceString(workspace?.streamTracking?.activeTurnRef)
  );
}

function resolveTraceMessageCount(workspace) {
  if (hasConversationView(workspace)) {
    return buildConversationViewTraceSummary(workspace.conversationView).displayRowCount;
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
