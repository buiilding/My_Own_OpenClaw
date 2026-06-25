/**
 * Owns renderer pending-turn state primitives for chat workspace reducers.
 */

import type {
  ChatMessage,
} from './desktopChatMessageTypes';
import {
  DesktopPendingTurnBridgeRuntime,
} from './desktopPendingTurnBridgeRuntime';

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

type PendingTurnWorkspaceState = {
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: unknown;
  thinkingSourceEventType: string | null;
  currentTurnProjection: unknown;
  conversationView: unknown;
  pendingTurn: DesktopPendingTurnState | null;
  supersededTurnRefs: Record<string, true>;
};

type PendingTurnWorkspaceMutationInput = {
  currentWorkspace: PendingTurnWorkspaceState;
  pendingTurn: unknown;
  replayMessages?: ChatMessage[] | null;
  skipEchoedPendingTurn?: boolean;
  supersededTurnRef?: string | null;
};

type PendingTurnWorkspaceMutation = {
  messages: ChatMessage[];
  normalizedPendingTurn: DesktopPendingTurnState;
  optimisticMessage: ChatMessage;
  workspace: PendingTurnWorkspaceState;
};

const {
  buildPendingTurnUserMessage,
} = DesktopPendingTurnBridgeRuntime;

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

function isEchoedPendingTurn(
  currentWorkspace: PendingTurnWorkspaceState,
  pendingTurn: DesktopPendingTurnState,
): boolean {
  const echoedPendingMessage = currentWorkspace.messages.find((message) => (
    message.id === pendingTurn.userMessageId
    && message.sender === 'user'
    && message.text === pendingTurn.text
    && message.turnRef === pendingTurn.turnRef
  ));
  return Boolean(
    echoedPendingMessage
    && currentWorkspace.pendingTurn?.conversationRef === pendingTurn.conversationRef
    && currentWorkspace.pendingTurn?.turnRef === pendingTurn.turnRef
    && currentWorkspace.pendingTurn?.userMessageId === pendingTurn.userMessageId
    && currentWorkspace.pendingTurn?.text === pendingTurn.text,
  );
}

function mergePendingTurnMessage(
  messages: ChatMessage[],
  optimisticMessage: ChatMessage,
): ChatMessage[] {
  const existingMessageIndex = messages.findIndex(
    (message) => message?.id === optimisticMessage.id,
  );
  return existingMessageIndex === -1
    ? [...messages, optimisticMessage]
    : messages.map((message, index) => (
      index === existingMessageIndex ? { ...message, ...optimisticMessage } : message
    ));
}

function buildPendingTurnWorkspaceMutation({
  currentWorkspace,
  pendingTurn,
  replayMessages = null,
  skipEchoedPendingTurn = false,
  supersededTurnRef = null,
}: PendingTurnWorkspaceMutationInput): PendingTurnWorkspaceMutation | null {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return null;
  }
  if (skipEchoedPendingTurn && isEchoedPendingTurn(currentWorkspace, normalizedPendingTurn)) {
    return null;
  }
  const optimisticMessage = buildPendingTurnUserMessage(normalizedPendingTurn) as ChatMessage | null;
  if (!optimisticMessage) {
    return null;
  }
  const sourceMessages = Array.isArray(replayMessages)
    ? replayMessages
    : currentWorkspace.messages;
  const nextMessages = mergePendingTurnMessage(sourceMessages, optimisticMessage);
  const nextWorkspace = {
    ...currentWorkspace,
    messages: nextMessages,
    isSending: true,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    currentTurnProjection: null,
    conversationView: null,
    pendingTurn: normalizedPendingTurn,
    supersededTurnRefs: removeSupersededTurnRef(
      supersededTurnRef
        ? addSupersededTurnRef(currentWorkspace.supersededTurnRefs, supersededTurnRef)
        : currentWorkspace.supersededTurnRefs,
      normalizedPendingTurn.turnRef,
    ),
  };
  return {
    messages: nextMessages,
    normalizedPendingTurn,
    optimisticMessage,
    workspace: nextWorkspace,
  };
}

export const DesktopChatPendingTurnStateRuntime = Object.freeze({
  addSupersededTurnRef,
  buildPendingTurnWorkspaceMutation,
  doesPendingTurnMatch,
  normalizePendingTurn,
  removeSupersededTurnRef,
});
