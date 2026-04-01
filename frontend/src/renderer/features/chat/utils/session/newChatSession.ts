import type { TokenCounts } from '../../stores/chatStore';
import { setActiveConversationRef } from '../../../../infrastructure/transcript/TranscriptWriter';
import { markConversationBackendStateFreshLocal } from '../../session/conversationBackendSyncRuntime';
import { createConversationRef } from './conversationRef';
import { resetActiveChatSession } from './resetActiveChatSession';

type NewChatSessionOptions = {
  clearMessages: (conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
};

export const startNewChatSession = ({
  clearMessages,
  setIsSending,
  setThinkingStatus,
  setTokenCounts,
}: NewChatSessionOptions): string => {
  resetActiveChatSession({
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  });

  const nextConversationRef = createConversationRef();
  setActiveConversationRef(nextConversationRef);
  markConversationBackendStateFreshLocal(nextConversationRef);
  return nextConversationRef;
};
