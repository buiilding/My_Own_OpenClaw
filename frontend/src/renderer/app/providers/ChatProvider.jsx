import { useEffect } from 'react';
import { useChatStream } from '../../features/chat/hooks/useChatStream';
import { useToolRunner } from '../../features/chat/hooks/useToolRunner';
import { useChatSessionBootstrap } from '../../features/chat/hooks/useChatSessionBootstrap';
import { invalidateConversationBackendSyncState } from '../../features/chat/session/conversationBackendSyncRuntime';
import { useChatStore } from '../../features/chat/stores/chatStore';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';
import { useTranscriptSessionInfo } from '../../features/dashboard/hooks/useTranscriptSessionInfo';
import { shouldProjectSessionConversationRef } from '../../features/chat/session/conversationSessionRuntime';
import { ChatContext, EMPTY_CHAT_CONTEXT } from './ChatContext';

/**
 * ChatProvider - Thin wrapper that sets up chat hooks and provides store access.
 * No business logic - just composition.
 */
export function ChatProvider({ children, enableToolRunner = true, enableTranscript = true }) {
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const transcriptSessionInfo = useTranscriptSessionInfo();
  const bootstrapSession = useChatSessionBootstrap();

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    const conversationRef = transcriptSessionInfo?.conversationRef || null;
    if (!shouldProjectSessionConversationRef(conversationRef)) {
      return;
    }
    setActiveConversationRef(conversationRef);
  }, [setActiveConversationRef, transcriptSessionInfo?.conversationRef]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.IPC_STATUS, (payload) => {
      if (payload?.isConnected === true) {
        return;
      }
      invalidateConversationBackendSyncState();
    });
    return () => {
      removeListener?.();
    };
  }, []);

  useChatStream(enableTranscript);
  useToolRunner(enableToolRunner);

  return (
    <ChatContext.Provider value={EMPTY_CHAT_CONTEXT}>
      {children}
    </ChatContext.Provider>
  );
}
