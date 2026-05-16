import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../infrastructure/transcript/TranscriptWriter';

export const DesktopTranscriptSessionRuntimeClient = {
  getActiveConversationRef(): string | null {
    return getActiveConversationRef();
  },

  getTranscriptSessionInfo(): ReturnType<typeof getTranscriptSessionInfo> {
    return getTranscriptSessionInfo();
  },

  setActiveConversationRef(conversationRef: string | null): void {
    setActiveConversationRef(conversationRef);
  },

  updateTranscriptSession(
    conversationRef?: string | null,
    userId?: string | null,
  ): void {
    updateTranscriptSession(conversationRef, userId);
  },
};
