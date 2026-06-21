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
import { ChatContext, EMPTY_CHAT_CONTEXT } from './ChatContext';

const {
  configureRendererTraceWorkspaceSnapshotResolver,
} = DesktopRendererTraceRuntime;

function resolveChatTraceWorkspaceSnapshot(conversationRef) {
  const store = useChatStore.getState();
  const workspace = store.getWorkspaceState(conversationRef);
  const lastMessage = workspace.messages[workspace.messages.length - 1] || null;
  return {
    activeConversationRef: store.activeConversationRef,
    workspaceMessageCount: workspace.messages.length,
    thinkingStatus: workspace.thinkingStatus,
    phase: workspace.streamTracking.phase,
    activeTurnRef: workspace.streamTracking.activeTurnRef,
    lastMessage: lastMessage ? {
      sender: lastMessage.sender,
      type: lastMessage.type || null,
      textLength: typeof lastMessage.text === 'string' ? lastMessage.text.length : 0,
      turnRef: lastMessage.turnRef || null,
      sourceEventType: lastMessage.sourceEventType || null,
    } : null,
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

  return (
    <ChatContext.Provider value={EMPTY_CHAT_CONTEXT}>
      {children}
    </ChatContext.Provider>
  );
}
