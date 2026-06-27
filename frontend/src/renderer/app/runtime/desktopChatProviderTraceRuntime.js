/**
 * Builds chat-provider trace snapshots from renderer workspace read models.
 */

import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

const {
  buildConversationViewTraceSummary,
} = DesktopConversationDisplayProjection;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

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

function resolveTraceLastMessage(workspace) {
  if (hasWorkspaceConversationView(workspace)) {
    return buildConversationViewTraceSummary(workspace.conversationView).lastMessage;
  }
  return traceLastMessageFromReadModel(workspace?.lastMessage);
}

function resolveTraceActiveTurnRef(workspace) {
  if (hasWorkspaceConversationView(workspace)) {
    return buildConversationViewTraceSummary(workspace.conversationView).liveTurnRef;
  }
  return normalizeTraceString(workspace?.activeTurnRef);
}

function resolveTraceMessageCount(workspace) {
  if (hasWorkspaceConversationView(workspace)) {
    return buildConversationViewTraceSummary(workspace.conversationView).displayRowCount;
  }
  return typeof workspace?.messageCount === 'number' ? workspace.messageCount : 0;
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
