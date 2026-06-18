/**
 * Coordinates desktop conversation session helper rules for renderer runtime clients.
 */

import {
  applyEventChatConversationProjection,
  applyTranscriptSessionUserBinding,
} from './desktopConversationSessionRuntime';

type TranscriptSessionUpdater = (
  conversationRef?: string | null,
  userId?: string | null,
) => void;

type TranscriptSessionUserBindingOptions = {
  userId: unknown;
  updateTranscriptSession: TranscriptSessionUpdater;
};

type EventChatConversationProjectionOptions = {
  eventType: string;
  explicitConversationRef: unknown;
  resolvedConversationRef: unknown;
  activeConversationRef: unknown;
  setChatConversationRef: (conversationRef: string) => void;
};

export const DesktopConversationSessionRuntimeClient = {
  bindTranscriptUser({
    userId,
    updateTranscriptSession,
  }: TranscriptSessionUserBindingOptions): boolean {
    return applyTranscriptSessionUserBinding({
      userId,
      updateTranscriptSession,
    });
  },

  applyEventChatConversationProjection(
    options: EventChatConversationProjectionOptions,
  ): string | null {
    return applyEventChatConversationProjection(options);
  },
};
