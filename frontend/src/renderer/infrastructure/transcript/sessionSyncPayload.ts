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

export const extractTranscriptSessionSyncPayload = (
  payload: unknown,
): {
  conversationRef?: string | null;
  userId?: string | null;
} | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const hasConversationRef = (
    hasOwnProperty(payload, 'conversationRef')
    || hasOwnProperty(payload, 'conversation_ref')
    || hasOwnProperty(payload, 'sessionId')
    || hasOwnProperty(payload, 'session_id')
  );
  const hasUserId = hasOwnProperty(payload, 'userId') || hasOwnProperty(payload, 'user_id');
  if (!hasConversationRef && !hasUserId) {
    return null;
  }

  const conversationRefCandidate = hasOwnProperty(payload, 'conversationRef')
    ? (payload as { conversationRef?: unknown }).conversationRef
    : (
      hasOwnProperty(payload, 'conversation_ref')
        ? (payload as { conversation_ref?: unknown }).conversation_ref
        : (
          hasOwnProperty(payload, 'sessionId')
            ? (payload as { sessionId?: unknown }).sessionId
            : (payload as { session_id?: unknown }).session_id
        )
    );
  const userIdCandidate = hasOwnProperty(payload, 'userId')
    ? (payload as { userId?: unknown }).userId
    : (payload as { user_id?: unknown }).user_id;

  return {
    conversationRef: hasConversationRef
      ? normalizeOptionalSessionField(conversationRefCandidate)
      : undefined,
    userId: hasUserId
      ? normalizeOptionalSessionField(userIdCandidate)
      : undefined,
  };
};
