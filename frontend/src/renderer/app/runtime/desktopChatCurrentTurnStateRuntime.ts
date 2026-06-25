/**
 * Owns renderer current-turn projection state primitives for chat workspace reducers.
 */

import type {
  CurrentTurnProjection,
} from './desktopConversationRuntimeContracts';

type CurrentTurnMatchInput = {
  conversationRef?: string | null;
  turnRef?: string | null;
} | null | undefined;

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

function doesCurrentTurnProjectionMatch(
  currentTurnProjection: CurrentTurnProjection | null,
  input?: CurrentTurnMatchInput,
): boolean {
  if (!currentTurnProjection || !input) {
    return false;
  }
  const conversationRef = normalizeConversationRef(input.conversationRef);
  const turnRef = normalizeTurnRef(input.turnRef);
  const projectionConversationRef = normalizeConversationRef(currentTurnProjection.conversationRef);
  const projectionTurnRef = normalizeTurnRef(currentTurnProjection.turnRef);
  return (
    (!conversationRef || projectionConversationRef === conversationRef)
    && (!turnRef || projectionTurnRef === turnRef)
  );
}

export const DesktopChatCurrentTurnStateRuntime = Object.freeze({
  doesCurrentTurnProjectionMatch,
});
