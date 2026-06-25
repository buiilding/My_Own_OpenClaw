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
};

type PendingTurnProjection = {
  conversationRef: string;
  turnRef: string;
} | null;

type ReplayReadModel = {
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

const replayReadModelObjectCache = new WeakMap<object, WeakMap<object, ReplayReadModel>>();
const replayReadModelPrimitiveCache = new Map<string, ReplayReadModel>();
const stopTurnTargetCache = new Map<string, StopTurnTarget>();

function readReplayReadModelObjectCache(
  conversationView: ConversationView | null,
  messages: ChatMessage[],
): ReplayReadModel | null {
  if (!conversationView || typeof conversationView !== 'object') {
    return null;
  }
  const messagesKey = messages as unknown as object;
  let messageCache = replayReadModelObjectCache.get(conversationView);
  if (!messageCache) {
    messageCache = new WeakMap<object, ReplayReadModel>();
    replayReadModelObjectCache.set(conversationView, messageCache);
  }
  const cached = messageCache.get(messagesKey);
  if (cached) {
    return cached;
  }
  const replayReadModel = {
    conversationView,
    messages,
  };
  messageCache.set(messagesKey, replayReadModel);
  return replayReadModel;
}

function selectStableReplayReadModel({
  conversationView = null,
  messages = [],
}: {
  conversationView?: ConversationView | null;
  messages?: ChatMessage[];
}): ReplayReadModel {
  const replayMessages = Array.isArray(messages) ? messages : [];
  const objectCachedReadModel = readReplayReadModelObjectCache(conversationView, replayMessages);
  if (objectCachedReadModel) {
    return objectCachedReadModel;
  }
  const primitiveKey = [
    conversationView ? 'view' : 'none',
    replayMessages.length,
  ].join('\u0001');
  const cached = replayReadModelPrimitiveCache.get(primitiveKey);
  if (
    cached
    && cached.conversationView === conversationView
    && cached.messages === replayMessages
  ) {
    return cached;
  }
  if (replayReadModelPrimitiveCache.size > 64) {
    replayReadModelPrimitiveCache.clear();
  }
  const replayReadModel = {
    conversationView,
    messages: replayMessages,
  };
  replayReadModelPrimitiveCache.set(primitiveKey, replayReadModel);
  return replayReadModel;
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
  const presentationState = buildChatInterfacePresentationState({
    activeConversationRef,
    conversationView,
    currentTurnProjection: interfaceState.currentTurnProjection as CurrentTurnProjection | null,
    messages: interfaceState.messages as ChatMessage[],
    pendingTurn,
  });
  const {
    replayFallbackMessages,
    ...chatPresentationState
  } = presentationState;
  return {
    ...interfaceState,
    ...chatPresentationState,
    replayReadModel: selectStableReplayReadModel({
      conversationView,
      messages: replayFallbackMessages,
    }),
    stopTurnTarget: selectStableStopTurnTarget({
      conversationRef: activeConversationRef,
      conversationView,
      pendingTurn,
    }),
    chatSurfaceState: projectDesktopChatSurfaceState({
      activeWorkspace,
    }),
  };
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
  latestConversationView = null,
}: {
  activeConversationRef?: string | null;
  activeWorkspace: DesktopChatWorkspaceProjection;
  latestConversationView?: ConversationView | null;
}) {
  const liveTurnSurfaceState = projectDesktopLiveTurnSurfaceState({
    activeWorkspace,
    latestConversationView,
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
  buildLiveTurnSurfaceSelectorState,
});
