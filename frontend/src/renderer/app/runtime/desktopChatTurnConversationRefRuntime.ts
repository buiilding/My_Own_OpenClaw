import type {
  ChatMessage,
} from './desktopChatMessageTypes';

type TurnConversationRefs = Record<string, string>;

let rendererTurnConversationRefs: TurnConversationRefs = {};

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

function recordRendererTurnConversationRefs(
  messages: ChatMessage[],
  conversationRef?: string | null,
): void {
  rendererTurnConversationRefs = mergeTurnConversationRefs(
    rendererTurnConversationRefs,
    messages,
    conversationRef,
  );
}

function registerRendererTurnConversationRef(
  turnRef?: string | null,
  conversationRef?: string | null,
): void {
  rendererTurnConversationRefs = registerTurnConversationRef(
    rendererTurnConversationRefs,
    turnRef,
    conversationRef,
  );
}

function resolveRendererConversationRefForTurn(turnRef?: string | null): string | null {
  return resolveConversationRefForTurn(rendererTurnConversationRefs, turnRef);
}

function getRendererTurnConversationRefsSnapshot(): TurnConversationRefs {
  return { ...rendererTurnConversationRefs };
}

function resetRendererTurnConversationRefs(): void {
  rendererTurnConversationRefs = {};
}

export const DesktopChatTurnConversationRefRuntime = Object.freeze({
  getRendererTurnConversationRefsSnapshot,
  mergeTurnConversationRefs,
  normalizeTurnRef,
  recordRendererTurnConversationRefs,
  registerTurnConversationRef,
  registerRendererTurnConversationRef,
  resolveConversationRefForTurn,
  resolveRendererConversationRefForTurn,
  resetRendererTurnConversationRefs,
});
