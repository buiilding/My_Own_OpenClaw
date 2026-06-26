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
import {
  DesktopChatSendStateRuntime,
} from './desktopChatSendStateRuntime';

type DesktopChatWorkspaceProjection = {
  messages: ChatMessage[];
  thinkingStatus: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: unknown | null;
  tokenCounts?: unknown | null;
  conversationView?: ConversationView | null;
  pendingTurn?: unknown | null;
  rendererAnnotations?: unknown[];
  sdkLiveTurn?: CurrentTurnProjection | null;
};

type PendingTurnProjection = {
  conversationRef: string;
  turnRef: string;
} | null;

type ChatSendReadModel = {
  hasPriorUserMessages: boolean;
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
const {
  hasPriorUserMessages,
} = DesktopChatSendStateRuntime;
const chatSendReadModelWithPriorUserMessages = Object.freeze({
  hasPriorUserMessages: true,
});
const chatSendReadModelWithoutPriorUserMessages = Object.freeze({
  hasPriorUserMessages: false,
});
const stopTurnTargetCache = new Map<string, StopTurnTarget>();

function selectStableChatSendReadModel({
  conversationView = null,
  messages = [],
}: {
  conversationView?: ConversationView | null;
  messages?: ChatMessage[];
}): ChatSendReadModel {
  const fallbackMessages = Array.isArray(messages) ? messages : [];
  return hasPriorUserMessages({
    conversationView,
    messages: fallbackMessages,
  })
    ? chatSendReadModelWithPriorUserMessages
    : chatSendReadModelWithoutPriorUserMessages;
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
    messages: presentationMessages,
    pendingTurn,
    rendererAnnotations: interfaceState.rendererAnnotations,
    sdkLiveTurn: interfaceState.sdkLiveTurn as CurrentTurnProjection | null,
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
  const messages = conversationView ? [] : activeWorkspace.messages;
  return selectStableChatSendReadModel({
    conversationView,
    messages,
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
