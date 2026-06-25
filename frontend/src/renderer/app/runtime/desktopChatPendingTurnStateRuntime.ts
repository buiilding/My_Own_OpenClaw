/**
 * Owns renderer pending-turn state primitives for chat workspace reducers.
 */

type PendingTurnMatchInput = {
  conversationRef?: string | null;
  turnRef?: string | null;
} | null | undefined;

export type DesktopPendingTurnState = {
  conversationRef: string;
  turnRef: string;
  userMessageId: string;
  text: string;
  timestamp: string;
  attachmentFilenames: string[] | null;
};

function normalizeConversationRef(conversationRef?: string | null): string | null {
  if (typeof conversationRef !== 'string') {
    return null;
  }
  const normalizedConversationRef = conversationRef.trim();
  return normalizedConversationRef.length > 0 ? normalizedConversationRef : null;
}

function normalizeTurnRef(turnRef?: string | null): string | null {
  if (typeof turnRef !== 'string') {
    return null;
  }
  const normalizedTurnRef = turnRef.trim();
  return normalizedTurnRef.length > 0 ? normalizedTurnRef : null;
}

function normalizePendingTurn(value: unknown): DesktopPendingTurnState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const conversationRef = normalizeConversationRef(source.conversationRef as string | null | undefined);
  const turnRef = normalizeTurnRef(source.turnRef as string | null | undefined);
  const userMessageId = typeof source.userMessageId === 'string' && source.userMessageId.trim()
    ? source.userMessageId.trim()
    : null;
  const text = typeof source.text === 'string' ? source.text : null;
  const timestamp = typeof source.timestamp === 'string' && source.timestamp.trim()
    ? source.timestamp
    : null;
  if (!conversationRef || !turnRef || !userMessageId || text === null || !timestamp) {
    return null;
  }
  const attachmentFilenames = Array.isArray(source.attachmentFilenames)
    ? source.attachmentFilenames.filter((entry): entry is string => (
      typeof entry === 'string' && entry.trim().length > 0
    ))
    : null;
  return {
    conversationRef,
    turnRef,
    userMessageId,
    text,
    timestamp,
    attachmentFilenames: attachmentFilenames && attachmentFilenames.length > 0
      ? attachmentFilenames
      : null,
  };
}

function doesPendingTurnMatch(
  pendingTurn: DesktopPendingTurnState | null,
  input?: PendingTurnMatchInput,
): boolean {
  if (!pendingTurn) {
    return false;
  }
  if (!input) {
    return true;
  }
  const conversationRef = normalizeConversationRef(input.conversationRef);
  const turnRef = normalizeTurnRef(input.turnRef);
  return (
    (!conversationRef || pendingTurn.conversationRef === conversationRef)
    && (!turnRef || pendingTurn.turnRef === turnRef)
  );
}

function addSupersededTurnRef(
  current: Record<string, true>,
  turnRef?: string | null,
): Record<string, true> {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  if (!normalizedTurnRef || current[normalizedTurnRef]) {
    return current;
  }
  return {
    ...current,
    [normalizedTurnRef]: true,
  };
}

function removeSupersededTurnRef(
  current: Record<string, true>,
  turnRef?: string | null,
): Record<string, true> {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  if (!normalizedTurnRef || !current[normalizedTurnRef]) {
    return current;
  }
  const { [normalizedTurnRef]: _removed, ...next } = current;
  return next;
}

export const DesktopChatPendingTurnStateRuntime = Object.freeze({
  addSupersededTurnRef,
  doesPendingTurnMatch,
  normalizePendingTurn,
  removeSupersededTurnRef,
});
