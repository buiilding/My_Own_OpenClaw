import type { TokenCounts } from '../../stores/chatStore';
import {
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../../../infrastructure/transcript/TranscriptWriter';

type ResetActiveChatSessionOptions = {
  conversationRef?: string | null;
  userId?: string | null;
  clearMessages: (conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
  setChatActiveConversationRef?: (conversationRef: string | null) => void;
};

export const resetActiveChatSession = ({
  conversationRef = null,
  userId,
  clearMessages,
  setIsSending,
  setThinkingStatus,
  setTokenCounts,
  setChatActiveConversationRef,
}: ResetActiveChatSessionOptions): void => {
  const targetConversationRef = conversationRef || null;

  setActiveConversationRef(null);
  updateTranscriptSession(null, userId || undefined);
  clearMessages(targetConversationRef);
  setIsSending(false, targetConversationRef);
  setThinkingStatus(null, targetConversationRef);
  setTokenCounts(null, targetConversationRef);

  if (typeof setChatActiveConversationRef === 'function') {
    setChatActiveConversationRef(null);
  }
};
