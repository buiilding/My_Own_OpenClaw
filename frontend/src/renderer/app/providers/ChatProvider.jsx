import { useEffect } from 'react';
import { useChatStream } from '../../features/chat/hooks/useChatStream';
import { useConversationRuntimeProjectionStream } from '../../features/chat/hooks/useConversationRuntimeProjectionStream';
import { useChatSessionBootstrap } from '../../features/chat/hooks/useChatSessionBootstrap';
import { invalidateConversationInferenceSessionState } from '../../features/chat/session/conversationInferenceSessionRuntime';
import { useConversationSessionProjection } from '../../features/chat/session/useConversationSessionProjection';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';
import { useTranscriptSessionInfo } from '../../features/dashboard/hooks/useTranscriptSessionInfo';
import { ChatContext, EMPTY_CHAT_CONTEXT } from './ChatContext';

/**
 * ChatProvider - Thin wrapper that sets up chat hooks and provides store access.
 * No business logic - just composition.
 */
export function ChatProvider({ children, enableTranscript = true }) {
  const transcriptSessionInfo = useTranscriptSessionInfo();
  const bootstrapSession = useChatSessionBootstrap();

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useConversationSessionProjection(transcriptSessionInfo);

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

  useConversationRuntimeProjectionStream();
  useChatStream(enableTranscript);

  return (
    <ChatContext.Provider value={EMPTY_CHAT_CONTEXT}>
      {children}
    </ChatContext.Provider>
  );
}
