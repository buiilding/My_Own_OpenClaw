/**
 * Coordinates the transcript-session app-runtime client for the renderer UI.
 */

import { DesktopTranscriptSessionRuntime } from './desktopTranscriptSessionRuntime';
import { DesktopConversationSessionRuntimeClient } from './desktopConversationSessionRuntimeClient';

function updateTranscriptSession(
  conversationRef?: string | null,
  userId?: string | null,
): void {
  DesktopTranscriptSessionRuntime.applyTranscriptSessionUpdate(conversationRef, userId, {
    syncToMainProcess: true,
  });
}

export const DesktopTranscriptSessionRuntimeClient = {
  getActiveConversationRef(): string | null {
    return DesktopTranscriptSessionRuntime.getActiveConversationRef();
  },

  getTranscriptSessionInfo(): ReturnType<typeof DesktopTranscriptSessionRuntime.getTranscriptSessionInfo> {
    return DesktopTranscriptSessionRuntime.getTranscriptSessionInfo();
  },

  setActiveConversationRef(conversationRef: string | null): void {
    DesktopTranscriptSessionRuntime.applyTranscriptSessionUpdate(conversationRef, undefined, {
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
