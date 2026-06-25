import type {
  ChatMessage,
} from './desktopChatMessageTypes';

type TurnConversationRefs = Record<string, string>;

function normalizeTurnRef(turnRef?: string | null): string | null {
  if (typeof turnRef !== 'string') {
    return null;
  }
  const normalizedTurnRef = turnRef.trim();
  return normalizedTurnRef.length > 0 ? normalizedTurnRef : null;
}

function normalizeConversationRef(conversationRef?: string | null): string | null {
  if (typeof conversationRef !== 'string') {
    return null;
  }
  const normalizedConversationRef = conversationRef.trim();
  return normalizedConversationRef.length > 0 ? normalizedConversationRef : null;
}

function registerTurnConversationRef(
  currentTurnConversationRefs: TurnConversationRefs,
  turnRef?: string | null,
  conversationRef?: string | null,
): TurnConversationRefs {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedTurnRef || !normalizedConversationRef) {
    return currentTurnConversationRefs;
  }
  if (currentTurnConversationRefs[normalizedTurnRef] === normalizedConversationRef) {
    return currentTurnConversationRefs;
  }
  return {
    ...currentTurnConversationRefs,
    [normalizedTurnRef]: normalizedConversationRef,
  };
}

function mergeTurnConversationRefs(
  currentTurnConversationRefs: TurnConversationRefs,
  messages: ChatMessage[],
  conversationRef?: string | null,
): TurnConversationRefs {
  let nextTurnConversationRefs = currentTurnConversationRefs;
  for (const message of messages) {
    nextTurnConversationRefs = registerTurnConversationRef(
      nextTurnConversationRefs,
      message.turnRef,
      conversationRef,
    );
  }
  return nextTurnConversationRefs;
}

function resolveConversationRefForTurn(
  currentTurnConversationRefs: TurnConversationRefs,
  turnRef?: string | null,
): string | null {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  if (!normalizedTurnRef) {
    return null;
  }
  return currentTurnConversationRefs[normalizedTurnRef] || null;
}

export const DesktopChatTurnConversationRefRuntime = Object.freeze({
  mergeTurnConversationRefs,
  normalizeTurnRef,
  registerTurnConversationRef,
  resolveConversationRefForTurn,
});
