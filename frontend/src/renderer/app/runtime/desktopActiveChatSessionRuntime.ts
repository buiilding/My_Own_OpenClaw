/**
 * Coordinates renderer active chat session reset behavior shared by chat and dashboard UI.
 */

import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { applyRendererConversationSelection } from './desktopConversationSessionRuntime';
import type { TokenCounts } from './desktopChatMessageTypes';

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

  applyRendererConversationSelection({
    conversationRef: null,
    userId: userId || undefined,
    updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
    setChatConversationRef: setChatActiveConversationRef,
  });
  clearMessages(targetConversationRef);
  setIsSending(false, targetConversationRef);
  setThinkingStatus(null, targetConversationRef);
  setTokenCounts(null, targetConversationRef);
};
