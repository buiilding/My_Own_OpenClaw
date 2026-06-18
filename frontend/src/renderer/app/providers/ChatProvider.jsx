/**
 * Provides the chat provider module for the renderer UI.
 */

import { useEffect } from 'react';
import { useChatStream } from '../../features/chat/hooks/useChatStream';
import { useConversationRuntimeProjectionStream } from '../../features/chat/hooks/useConversationRuntimeProjectionStream';
import { useChatSessionBootstrap } from '../../features/chat/hooks/useChatSessionBootstrap';
import { useConversationSessionProjection } from '../../features/chat/session/useConversationSessionProjection';
import { useDesktopTranscriptSessionInfo } from '../runtime/desktopTranscriptSessionInfoRuntimeClient';
import { ChatContext, EMPTY_CHAT_CONTEXT } from './ChatContext';

/**
 * ChatProvider - Thin wrapper that sets up chat hooks and provides store access.
 * No business logic - just composition.
 */
export function ChatProvider({ children, enableTranscript = true }) {
  const transcriptSessionInfo = useDesktopTranscriptSessionInfo();
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
