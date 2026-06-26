/**
 * Provides the chat provider module for the renderer UI.
 */

import { useEffect } from 'react';
import { useChatStream } from '../../features/chat/hooks/useChatStream';
import { useConversationRuntimeProjectionStream } from '../../features/chat/hooks/useConversationRuntimeProjectionStream';
import { useChatSessionBootstrap } from '../../features/chat/hooks/useChatSessionBootstrap';
import { useConversationSessionProjection } from '../../features/chat/session/useConversationSessionProjection';
import { useChatStore } from '../../features/chat/stores/chatStore';
import { DesktopRendererTraceRuntime } from '../runtime/desktopRendererTraceRuntime';
import { DesktopTranscriptSessionInfoRuntimeClient } from '../runtime/desktopTranscriptSessionInfoRuntimeClient';

const {
  configureRendererTraceWorkspaceSnapshotResolver,
} = DesktopRendererTraceRuntime;

function normalizeTraceString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveTraceTextLength(value) {
  return typeof value === 'string' ? value.length : 0;
}

function resolveLatestConversationViewRow(conversationView) {
  const displayRows = Array.isArray(conversationView?.displayRows)
    ? conversationView.displayRows
    : [];
  return displayRows[displayRows.length - 1] || null;
}

function resolveTraceLastMessage(workspace) {
  const latestViewRow = resolveLatestConversationViewRow(workspace.conversationView);
  if (latestViewRow) {
    return {
      sender: normalizeTraceString(latestViewRow.role) || normalizeTraceString(latestViewRow.sender),
      type: normalizeTraceString(latestViewRow.type),
      textLength: resolveTraceTextLength(latestViewRow.content ?? latestViewRow.text),
      turnRef: normalizeTraceString(latestViewRow.turnRef),
      sourceEventType: normalizeTraceString(latestViewRow.sourceEventType),
    };
  }
  const lastMessage = workspace.messages[workspace.messages.length - 1] || null;
  return lastMessage ? {
    sender: lastMessage.sender,
    type: lastMessage.type || null,
    textLength: typeof lastMessage.text === 'string' ? lastMessage.text.length : 0,
    turnRef: lastMessage.turnRef || null,
    sourceEventType: lastMessage.sourceEventType || null,
  } : null;
}

function resolveTraceActiveTurnRef(workspace) {
  return (
    normalizeTraceString(workspace.conversationView?.liveTurn?.turnRef)
    || normalizeTraceString(workspace.streamTracking?.activeTurnRef)
  );
}

function resolveTraceMessageCount(workspace) {
  const displayRows = Array.isArray(workspace.conversationView?.displayRows)
    ? workspace.conversationView.displayRows
    : null;
  return displayRows ? displayRows.length : workspace.messages.length;
}

function resolveChatTraceWorkspaceSnapshot(conversationRef) {
  const store = useChatStore.getState();
  const workspace = store.getWorkspaceState(conversationRef);
  const lastMessage = resolveTraceLastMessage(workspace);
  return {
    activeConversationRef: store.activeConversationRef,
    workspaceMessageCount: resolveTraceMessageCount(workspace),
    activeTurnRef: resolveTraceActiveTurnRef(workspace),
    lastMessage,
  };
}

configureRendererTraceWorkspaceSnapshotResolver(resolveChatTraceWorkspaceSnapshot);

/**
 * ChatProvider - Thin wrapper that sets up chat hooks and provides store access.
 * No business logic - just composition.
 */
export function ChatProvider({ children, enableTranscript = true }) {
  const transcriptSessionInfo = DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo();
  const bootstrapSession = useChatSessionBootstrap();

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useConversationSessionProjection(transcriptSessionInfo);

  useConversationRuntimeProjectionStream();
  useChatStream(enableTranscript);

  return children;
}
