/**
 * Coordinates the desktop transcript session runtime client for the renderer UI.
 */

import { desktopTranscriptSessionRuntime } from './desktopTranscriptSessionRuntime';

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

  updateTranscriptSession(
    conversationRef?: string | null,
    userId?: string | null,
  ): void {
    desktopTranscriptSessionRuntime.applyTranscriptSessionUpdate(conversationRef, userId, {
      syncToMainProcess: true,
    });
  },
};
