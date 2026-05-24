import type { TokenCounts } from '../../stores/chatStore';
import { clearConversationInferenceSessionState } from '../../session/conversationInferenceSessionRuntime';
import { DesktopTranscriptSessionRuntimeClient } from '../../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { applyRendererConversationSelection } from '../../session/conversationSessionRuntime';

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
  clearConversationInferenceSessionState(targetConversationRef);
  clearMessages(targetConversationRef);
  setIsSending(false, targetConversationRef);
  setThinkingStatus(null, targetConversationRef);
  setTokenCounts(null, targetConversationRef);
};
