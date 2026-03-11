import type { TokenCounts } from '../../stores/chatStore';
import { setActiveConversationRef } from '../../../../infrastructure/transcript/TranscriptWriter';
import { createConversationRef } from './conversationRef';
import { resetActiveChatSession } from './resetActiveChatSession';

type NewChatSessionOptions = {
  clearMessages: (conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
  stopActiveQuery?: () => void;
};

export const startNewChatSession = ({
  clearMessages,
  setIsSending,
  setThinkingStatus,
  setTokenCounts,
  stopActiveQuery,
}: NewChatSessionOptions): string => {
  if (stopActiveQuery) {
    stopActiveQuery();
  }

  resetActiveChatSession({
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  });

  const nextConversationRef = createConversationRef();
  setActiveConversationRef(nextConversationRef);
  return nextConversationRef;
};
