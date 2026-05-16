import { useEffect } from 'react';
import { useChatStream } from '../../features/chat/hooks/useChatStream';
import { useToolRunner } from '../../features/chat/hooks/useToolRunner';
import { useChatSessionBootstrap } from '../../features/chat/hooks/useChatSessionBootstrap';
import { invalidateConversationInferenceSessionState } from '../../features/chat/session/conversationInferenceSessionRuntime';
import { useChatStore } from '../../features/chat/stores/chatStore';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';
import { useTranscriptSessionInfo } from '../../features/dashboard/hooks/useTranscriptSessionInfo';
import { applyChatConversationProjection } from '../../features/chat/session/conversationSessionRuntime';
import { ChatContext, EMPTY_CHAT_CONTEXT } from './ChatContext';

/**
 * ChatProvider - Thin wrapper that sets up chat hooks and provides store access.
 * No business logic - just composition.
 */
export function ChatProvider({ children, enableToolRunner = false, enableTranscript = true }) {
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const transcriptSessionInfo = useTranscriptSessionInfo();
  const bootstrapSession = useChatSessionBootstrap();

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    applyChatConversationProjection({
      nextConversationRef: transcriptSessionInfo?.conversationRef,
      activeConversationRef,
      setChatConversationRef: setActiveConversationRef,
    });
  }, [activeConversationRef, setActiveConversationRef, transcriptSessionInfo?.conversationRef]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.IPC_STATUS, (payload) => {
      if (payload?.isConnected === true) {
        return;
      }
      invalidateConversationInferenceSessionState();
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
