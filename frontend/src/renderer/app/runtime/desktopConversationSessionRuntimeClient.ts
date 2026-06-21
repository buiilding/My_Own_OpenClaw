/**
 * Coordinates conversation session helper rules for renderer app-runtime clients.
 */

import {
  DesktopConversationSessionRuntime,
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

const {
  applyEventChatConversationProjection,
  applyTranscriptSessionUserBinding,
} = DesktopConversationSessionRuntime;

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
