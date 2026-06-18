/**
 * Coordinates the desktop transcript session runtime client for the renderer UI.
 */

import { desktopTranscriptSessionRuntime } from './desktopTranscriptSessionRuntime';
import { applyTranscriptSessionUserBinding } from '../../features/chat/session/conversationSessionRuntime';

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
    return applyTranscriptSessionUserBinding({
      userId,
      updateTranscriptSession,
    });
  },
};
