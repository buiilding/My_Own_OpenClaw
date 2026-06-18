/**
 * Coordinates renderer interaction diagnostics for feature clients.
 */

import { logUserSentMessage } from '../../infrastructure/interaction/rendererInteractionLogger';

export type UserSentMessageInteraction = {
  conversationRef?: string | null;
  senderSurface?: string | null;
  messageText?: string;
  textLength?: number;
  attachmentCount?: number;
  imageCount?: number;
  readableFileCount?: number;
};

export const DesktopInteractionRuntimeClient = {
  logUserSentMessage(details: UserSentMessageInteraction = {}): void {
    logUserSentMessage(details);
  },
};
