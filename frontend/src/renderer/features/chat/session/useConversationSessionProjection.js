import { useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { applyChatConversationProjection } from './conversationSessionRuntime';

export function useConversationSessionProjection(transcriptSessionInfo) {
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);

  useEffect(() => {
    applyChatConversationProjection({
      nextConversationRef: transcriptSessionInfo?.conversationRef,
      activeConversationRef,
      setChatConversationRef: setActiveConversationRef,
    });
  }, [activeConversationRef, setActiveConversationRef, transcriptSessionInfo?.conversationRef]);
}
