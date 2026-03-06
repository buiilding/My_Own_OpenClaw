import type { TokenCounts } from '../../stores/chatStore';
import { setActiveConversationRef } from '../../../../infrastructure/transcript/TranscriptWriter';
import { createConversationRef } from './conversationRef';

type NewChatSessionOptions = {
  clearMessages: () => void;
  setIsSending: (isSending: boolean) => void;
  setThinkingStatus: (status: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null) => void;
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

  clearMessages();
  setIsSending(false);
  setThinkingStatus(null);
  setTokenCounts(null);

  const nextConversationRef = createConversationRef();
  setActiveConversationRef(nextConversationRef);
  return nextConversationRef;
};
