/**
 * Coordinates SDK display-row projection for renderer chat consumers.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import type { ConversationView } from './desktopConversationRuntimeContracts';
import {
  DesktopSdkDisplayChatMessageProjectionRuntime,
} from './desktopSdkDisplayChatMessageProjectionRuntime';
import {
  DesktopPendingTurnBridgeRuntime,
} from './desktopPendingTurnBridgeRuntime';
import {
  DesktopConversationDisplayRowLookupRuntime,
} from './desktopConversationDisplayRowLookupRuntime';

const {
  buildChatMessagesFromSdkDisplayRows,
} = DesktopSdkDisplayChatMessageProjectionRuntime;
const {
  buildPendingTurnUserMessage,
} = DesktopPendingTurnBridgeRuntime;
const {
  findConversationViewUserDisplayRowForTurn,
  hasConversationViewUserDisplayRows,
} = DesktopConversationDisplayRowLookupRuntime;

type PendingTurnLike = {
  conversationRef?: string | null;
  timestamp?: string | null;
  turnRef?: string | null;
  userMessageId?: string | null;
  text?: string | null;
} | null | undefined;

type RendererMessageAnnotation = {
  feedback?: ChatMessage['feedback'];
  id: string;
};

type BuildConversationViewMessagesInput = {
  conversationView?: ConversationView | null;
  pendingTurn?: PendingTurnLike;
  preserveRendererAnnotations?: boolean;
  rendererAnnotations?: RendererMessageAnnotation[];
};

type BuildPendingBridgeMessagesInput = {
  messages?: ChatMessage[] | null;
  pendingTurn?: PendingTurnLike;
};

type BuildConversationViewTurnMessagesInput = {
  conversationView?: ConversationView | null;
  turnRef?: string | null;
};

type ConversationViewTraceLastMessage = {
  sender: string | null;
  sourceEventType: string | null;
  textLength: number;
  turnRef: string | null;
  type: string | null;
};

type ConversationViewTraceSummary = {
  displayRowCount: number;
  lastMessage: ConversationViewTraceLastMessage | null;
  liveTurnPhase: string | null;
  liveTurnRef: string | null;
};

type ConversationViewTraceSource = {
  displayRows?: unknown[] | null;
  liveTurn?: {
    phase?: string | null;
    turnRef?: string | null;
  } | null;
} | null | undefined;

function normalizeTurnRef(turnRef: string | null | undefined): string | null {
  return typeof turnRef === 'string' && turnRef.trim()
    ? turnRef.trim()
    : null;
}

function normalizeTraceString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveTraceTextLength(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

function buildConversationViewTraceSummary(
  conversationView: ConversationViewTraceSource,
): ConversationViewTraceSummary {
  const displayRows = Array.isArray(conversationView?.displayRows)
    ? conversationView.displayRows
    : [];
  const latestRow = displayRows[displayRows.length - 1] ?? null;
  const latestRecord = latestRow as Record<string, unknown> | null;
  return {
    displayRowCount: displayRows.length,
    liveTurnPhase: normalizeTraceString(conversationView?.liveTurn?.phase),
    liveTurnRef: normalizeTurnRef(conversationView?.liveTurn?.turnRef),
    lastMessage: latestRecord
      ? {
        sender: normalizeTraceString(latestRecord.role) || normalizeTraceString(latestRecord.sender),
        sourceEventType: normalizeTraceString(latestRecord.sourceEventType),
        textLength: resolveTraceTextLength(latestRecord.content ?? latestRecord.text),
        turnRef: normalizeTurnRef(latestRecord.turnRef as string | null | undefined),
        type: normalizeTraceString(latestRecord.type),
      }
      : null,
  };
}

function buildConversationViewTurnChatMessages({
  conversationView = null,
  turnRef = null,
}: BuildConversationViewTurnMessagesInput): ChatMessage[] {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  if (!conversationView || !normalizedTurnRef || typeof conversationView !== 'object') {
    return [];
  }
  const displayRows = Array.isArray(conversationView.displayRows)
    ? conversationView.displayRows.filter((row) => normalizeTurnRef(row.turnRef) === normalizedTurnRef)
    : [];
  if (displayRows.length === 0) {
    return [];
  }
  return buildChatMessagesFromSdkDisplayRows(displayRows);
}

function sdkUserTurnRefs(messages: ChatMessage[]): Set<string> {
  const turnRefs = new Set<string>();
  for (const message of messages) {
    if (message.sender !== 'user') {
      continue;
    }
    const turnRef = normalizeTurnRef(message.turnRef);
    if (turnRef) {
      turnRefs.add(turnRef);
    }
  }
  return turnRefs;
}

function pendingBridgeUserMessages(
  sdkMessages: ChatMessage[],
  pendingTurn: PendingTurnLike,
): ChatMessage[] {
  const sdkMessageIds = new Set(sdkMessages.map((message) => message.id));
  const projectedUserTurns = sdkUserTurnRefs(sdkMessages);
  const pendingMessage = buildPendingTurnUserMessage(pendingTurn) as ChatMessage | null;
  const pendingTurnRef = normalizeTurnRef(pendingMessage?.turnRef);
  if (
    pendingMessage
    && pendingTurnRef
    && !sdkMessageIds.has(pendingMessage.id)
    && !projectedUserTurns.has(pendingTurnRef)
  ) {
    return [pendingMessage];
  }
  return [];
}

function mergePendingBridgeUserMessages(
  sdkMessages: ChatMessage[],
  pendingMessages: ChatMessage[],
): ChatMessage[] {
  if (pendingMessages.length === 0) {
    return sdkMessages;
  }
  const merged = [...sdkMessages];
  for (const pendingMessage of pendingMessages) {
    const turnRef = normalizeTurnRef(pendingMessage.turnRef);
    const sameTurnIndex = turnRef
      ? merged.findIndex((message) => normalizeTurnRef(message.turnRef) === turnRef)
      : -1;
    if (sameTurnIndex >= 0) {
      merged.splice(sameTurnIndex, 0, pendingMessage);
    } else {
      merged.push(pendingMessage);
    }
  }
  return merged;
}

function mergeRendererAnnotationsIntoSdkMessages(
  sdkMessages: ChatMessage[],
  rendererAnnotations: RendererMessageAnnotation[],
): ChatMessage[] {
  if (rendererAnnotations.length === 0) {
    return sdkMessages;
  }
  const annotationsById = new Map(rendererAnnotations.map((message) => [message.id, message]));
  return sdkMessages.map((message) => {
    const annotation = annotationsById.get(message.id);
    return {
      ...message,
      ...(message.sender === 'assistant'
        && annotation
        && Object.prototype.hasOwnProperty.call(annotation, 'feedback')
        ? { feedback: annotation.feedback }
        : {}),
    };
  });
}

function appendPendingBridgeUserMessages(
  sdkMessages: ChatMessage[],
  pendingTurn: PendingTurnLike,
): ChatMessage[] {
  return mergePendingBridgeUserMessages(
    sdkMessages,
    pendingBridgeUserMessages(sdkMessages, pendingTurn),
  );
}

function buildPendingBridgeChatMessages({
  messages = [],
  pendingTurn = null,
}: BuildPendingBridgeMessagesInput = {}): ChatMessage[] {
  const baseMessages = Array.isArray(messages) ? messages : [];
  return appendPendingBridgeUserMessages(baseMessages, pendingTurn);
}

function buildConversationViewChatMessages({
  conversationView = null,
  pendingTurn = null,
  preserveRendererAnnotations = false,
  rendererAnnotations = [],
}: BuildConversationViewMessagesInput): ChatMessage[] {
  if (!conversationView || typeof conversationView !== 'object') {
    return [];
  }
  const displayRows = Array.isArray(conversationView.displayRows)
    ? conversationView.displayRows
    : [];
  const sdkMessages = buildChatMessagesFromSdkDisplayRows(displayRows);
  const annotatedSdkMessages = preserveRendererAnnotations
    ? mergeRendererAnnotationsIntoSdkMessages(
      sdkMessages,
      rendererAnnotations,
    )
    : sdkMessages;
  return appendPendingBridgeUserMessages(
    annotatedSdkMessages,
    pendingTurn,
  );
}

export const DesktopConversationDisplayProjection = Object.freeze({
  buildConversationViewChatMessages,
  buildConversationViewTraceSummary,
  buildConversationViewTurnChatMessages,
  buildPendingBridgeChatMessages,
  findConversationViewUserDisplayRowForTurn,
  hasConversationViewUserDisplayRows,
});
