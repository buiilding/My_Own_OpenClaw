/**
 * Provides the session sync payload module for the renderer UI.
 */

import { normalizeOptionalIncomingText } from '../text/incomingTextNormalization';

const hasOwnProperty = (value: unknown, key: string): boolean => {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key));
};

const normalizeOptionalSessionField = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }
  return normalizeOptionalIncomingText(value);
};

const rejectRemovedSessionIdentityKeys = (payload: object): void => {
  if (hasOwnProperty(payload, 'sessionId') || hasOwnProperty(payload, 'session_id')) {
    throw new Error('Transcript session sync payloads must use conversationRef; sessionId and session_id are not supported.');
  }
  if (hasOwnProperty(payload, 'conversation_ref') || hasOwnProperty(payload, 'user_id')) {
    throw new Error('Transcript session sync payloads must use conversationRef and userId; conversation_ref and user_id are not supported.');
  }
};

export const extractTranscriptSessionSyncPayload = (
  payload: unknown,
): {
  conversationRef?: string | null;
  userId?: string | null;
} | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  rejectRemovedSessionIdentityKeys(payload);

  const hasConversationRef = hasOwnProperty(payload, 'conversationRef');
  const hasUserId = hasOwnProperty(payload, 'userId');
  if (!hasConversationRef && !hasUserId) {
    return null;
  }

  return {
    conversationRef: hasConversationRef
      ? normalizeOptionalSessionField((payload as { conversationRef?: unknown }).conversationRef)
      : undefined,
    userId: hasUserId
      ? normalizeOptionalSessionField((payload as { userId?: unknown }).userId)
      : undefined,
  };
};
