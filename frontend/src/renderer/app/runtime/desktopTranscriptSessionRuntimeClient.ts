/**
 * Coordinates the transcript-session app-runtime client for the renderer UI.
 */

import { desktopTranscriptSessionRuntime } from './desktopTranscriptSessionRuntime';
import { DesktopConversationSessionRuntimeClient } from './desktopConversationSessionRuntimeClient';

function updateTranscriptSession(
  conversationRef?: string | null,
  userId?: string | null,
): void {
  desktopTranscriptSessionRuntime.applyTranscriptSessionUpdate(conversationRef, userId, {
    syncToMainProcess: true,
  });
}

export const DesktopTranscriptSessionRuntimeClient = {
  getActiveConversationRef(): string | null {
    return desktopTranscriptSessionRuntime.getActiveConversationRef();
  },

  getTranscriptSessionInfo(): ReturnType<typeof desktopTranscriptSessionRuntime.getTranscriptSessionInfo> {
    return desktopTranscriptSessionRuntime.getTranscriptSessionInfo();
  },

  setActiveConversationRef(conversationRef: string | null): void {
    desktopTranscriptSessionRuntime.applyTranscriptSessionUpdate(conversationRef, undefined, {
      syncToMainProcess: true,
    });
  },

  updateTranscriptSession,

  bindTranscriptUser(userId: unknown): boolean {
    return DesktopConversationSessionRuntimeClient.bindTranscriptUser({
      userId,
      updateTranscriptSession,
    });
  },
};
