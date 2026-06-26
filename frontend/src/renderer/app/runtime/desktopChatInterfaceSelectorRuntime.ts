/**
 * Selects chat interface view-model state for renderer UI consumers.
 */

import type {
  ConversationView,
  CurrentTurnProjection,
} from './desktopConversationRuntimeContracts';
import type {
  ChatMessage,
} from './desktopChatMessageTypes';
import {
  DesktopChatSurfaceSelectorRuntime,
} from './desktopChatSurfaceSelectorRuntime';
import {
  DesktopChatInterfacePresentationRuntime,
} from './desktopChatInterfacePresentationRuntime';
import {
  DesktopStopTurnRuntime,
} from './desktopStopTurnRuntime';

type DesktopChatWorkspaceProjection = {
  messages: ChatMessage[];
  thinkingStatus: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: unknown | null;
  tokenCounts?: unknown | null;
  currentTurnProjection?: CurrentTurnProjection | null;
  conversationView?: ConversationView | null;
  pendingTurn?: unknown | null;
  rendererAnnotations?: unknown[];
};

type PendingTurnProjection = {
  conversationRef: string;
  turnRef: string;
} | null;

type ChatSendReadModel = {
  conversationView: ConversationView | null;
  messages: ChatMessage[];
};

type StopTurnTarget = {
  source: string;
  conversationRef: string | null;
  turnRef: string | null;
  canStop: boolean;
};

const {
  projectDesktopChatSurfaceState,
  projectDesktopChatInterfaceState,
  projectDesktopLiveTurnSurfaceState,
} = DesktopChatSurfaceSelectorRuntime;
const {
  buildChatInterfacePresentationState,
} = DesktopChatInterfacePresentationRuntime;
const {
  resolveStopTurnTarget,
} = DesktopStopTurnRuntime;
const emptyChatMessages: ChatMessage[] = [];
const chatSendReadModelObjectCache = new WeakMap<object, WeakMap<object, ChatSendReadModel>>();
const chatSendReadModelPrimitiveCache = new Map<string, ChatSendReadModel>();
const stopTurnTargetCache = new Map<string, StopTurnTarget>();

function hasConversationView(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readChatSendReadModelObjectCache(
  conversationView: ConversationView | null,
  messages: ChatMessage[],
): ChatSendReadModel | null {
  if (!conversationView || typeof conversationView !== 'object') {
    return null;
  }
  const messagesKey = messages as unknown as object;
  let messageCache = chatSendReadModelObjectCache.get(conversationView);
  if (!messageCache) {
    messageCache = new WeakMap<object, ChatSendReadModel>();
    chatSendReadModelObjectCache.set(conversationView, messageCache);
  }
  const cached = messageCache.get(messagesKey);
  if (cached) {
    return cached;
  }
  const sendReadModel = {
    conversationView,
    messages,
  };
  messageCache.set(messagesKey, sendReadModel);
  return sendReadModel;
}

function selectStableChatSendReadModel({
  conversationView = null,
  messages = [],
}: {
  conversationView?: ConversationView | null;
  messages?: ChatMessage[];
}): ChatSendReadModel {
  const fallbackMessages = Array.isArray(messages) ? messages : [];
  const objectCachedReadModel = readChatSendReadModelObjectCache(conversationView, fallbackMessages);
  if (objectCachedReadModel) {
    return objectCachedReadModel;
  }
  const primitiveKey = [
    conversationView ? 'view' : 'none',
    fallbackMessages.length,
  ].join('\u0001');
  const cached = chatSendReadModelPrimitiveCache.get(primitiveKey);
  if (
    cached
    && cached.conversationView === conversationView
    && cached.messages === fallbackMessages
  ) {
    return cached;
  }
  if (chatSendReadModelPrimitiveCache.size > 64) {
    chatSendReadModelPrimitiveCache.clear();
  }
  const sendReadModel = {
    conversationView,
    messages: fallbackMessages,
  };
  chatSendReadModelPrimitiveCache.set(primitiveKey, sendReadModel);
  return sendReadModel;
}

function buildStopTurnTargetSignature(stopTurnTarget: StopTurnTarget): string {
  return [
    stopTurnTarget.source,
    stopTurnTarget.conversationRef ?? '',
    stopTurnTarget.turnRef ?? '',
    stopTurnTarget.canStop ? '1' : '0',
  ].join('\u0001');
}

function selectStableStopTurnTarget(input: {
  conversationRef?: string | null;
  conversationView?: ConversationView | null;
  pendingTurn?: PendingTurnProjection;
}): StopTurnTarget {
  const stopTurnTarget = resolveStopTurnTarget(input);
  const signature = buildStopTurnTargetSignature(stopTurnTarget);
  const cachedStopTurnTarget = stopTurnTargetCache.get(signature);
  if (cachedStopTurnTarget) {
    return cachedStopTurnTarget;
  }
  if (stopTurnTargetCache.size > 64) {
    stopTurnTargetCache.clear();
  }
  stopTurnTargetCache.set(signature, stopTurnTarget);
  return stopTurnTarget;
}

function buildChatInterfaceSelectorState({
  activeConversationRef = null,
  activeWorkspace,
}: {
  activeConversationRef?: string | null;
  activeWorkspace: DesktopChatWorkspaceProjection;
}) {
  const interfaceState = projectDesktopChatInterfaceState(activeWorkspace);
  const conversationView = interfaceState.conversationView as ConversationView | null;
  const pendingTurn = interfaceState.pendingTurn as PendingTurnProjection;
  const presentationMessages = interfaceState.messages as ChatMessage[];
  const chatPresentationState = buildChatInterfacePresentationState({
    activeConversationRef,
    conversationView,
    currentTurnProjection: interfaceState.currentTurnProjection as CurrentTurnProjection | null,
    messages: presentationMessages,
    pendingTurn,
    rendererAnnotations: interfaceState.rendererAnnotations,
  });
  const chatSurfaceState = projectDesktopChatSurfaceState({
    activeWorkspace,
  });
  return {
    thinkingStatus: interfaceState.thinkingStatus,
    thinkingSourceEventType: interfaceState.thinkingSourceEventType,
    compactionDebugInfo: interfaceState.compactionDebugInfo,
    tokenCounts: interfaceState.tokenCounts,
    ...chatPresentationState,
    stopTurnTarget: selectStableStopTurnTarget({
      conversationRef: activeConversationRef,
      conversationView,
      pendingTurn,
    }),
    chatSurfaceState,
  };
}

function buildChatSendReadModelSelectorState({
  activeWorkspace,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
}): ChatSendReadModel {
  const conversationView = activeWorkspace.conversationView ?? null;
  return selectStableChatSendReadModel({
    conversationView,
    messages: hasConversationView(conversationView) ? emptyChatMessages : activeWorkspace.messages,
  });
}

function buildChatInterfaceSurfaceSelectorState({
  activeWorkspace,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
}) {
  return projectDesktopChatSurfaceState({
    activeWorkspace,
  });
}

function buildLiveTurnSurfaceSelectorState({
  activeConversationRef = null,
  activeWorkspace,
}: {
  activeConversationRef?: string | null;
  activeWorkspace: DesktopChatWorkspaceProjection;
}) {
  const liveTurnSurfaceState = projectDesktopLiveTurnSurfaceState({
    activeWorkspace,
  });
  return {
    ...liveTurnSurfaceState,
    stopTurnTarget: selectStableStopTurnTarget({
      conversationRef: activeConversationRef,
      conversationView: liveTurnSurfaceState.conversationView as ConversationView | null,
      pendingTurn: liveTurnSurfaceState.pendingTurn as PendingTurnProjection,
    }),
  };
}

export const DesktopChatInterfaceSelectorRuntime = Object.freeze({
  buildChatInterfaceSelectorState,
  buildChatInterfaceSurfaceSelectorState,
  buildChatSendReadModelSelectorState,
  buildLiveTurnSurfaceSelectorState,
});
