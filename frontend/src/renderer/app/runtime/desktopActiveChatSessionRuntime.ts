/**
 * Coordinates renderer active chat session reset behavior shared by chat and dashboard UI.
 */

import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopConversationSessionRuntime } from './desktopConversationSessionRuntime';
import type { TokenCounts } from './desktopChatMessageTypes';

const {
  applyRendererConversationSelection,
} = DesktopConversationSessionRuntime;

type ResetActiveChatSessionOptions = {
  conversationRef?: string | null;
  userId?: string | null;
  clearMessages: (conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
  setChatActiveConversationRef?: (conversationRef: string | null) => void;
};

const resetActiveChatSession = ({
  conversationRef = null,
  userId,
  clearMessages,
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
  setThinkingStatus(null, targetConversationRef);
  setTokenCounts(null, targetConversationRef);
};

export const DesktopActiveChatSessionRuntime = Object.freeze({
  resetActiveChatSession,
});
