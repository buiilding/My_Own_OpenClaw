/**
 * Provides shared chat surface selector projection rules for renderer UI surfaces.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

type DesktopChatWorkspaceProjection = {
  messages: ChatMessage[];
  thinkingStatus: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: unknown | null;
  tokenCounts?: unknown | null;
  conversationView?: unknown | null;
  pendingTurn?: unknown | null;
  rendererAnnotations?: unknown[];
  sdkLiveTurn?: unknown | null;
};

const emptySurfaceMessages: ChatMessage[] = [];
const emptyRendererAnnotations: unknown[] = [];
let chatSurfaceStateCache: {
  conversationView: unknown | null | undefined;
  messages: ChatMessage[] | undefined;
  pendingTurn: unknown | null | undefined;
  sdkLiveTurn: unknown | null | undefined;
  state: {
    messages: ChatMessage[];
    sdkLiveTurn: unknown | null;
    conversationView: unknown | null;
    pendingTurn: unknown | null;
  } | null;
} = {
  conversationView: null,
  messages: undefined,
  pendingTurn: null,
  sdkLiveTurn: null,
  state: null,
};

function projectDesktopChatSurfaceState({
  activeWorkspace,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
}) {
  const conversationView = hasWorkspaceConversationView(activeWorkspace)
    ? activeWorkspace.conversationView ?? null
    : null;
  const messages = conversationView ? emptySurfaceMessages : activeWorkspace.messages;
  const sdkLiveTurn = conversationView ? null : activeWorkspace.sdkLiveTurn ?? null;
  const pendingTurn = activeWorkspace.pendingTurn ?? null;
  if (
    chatSurfaceStateCache.state
    && chatSurfaceStateCache.conversationView === conversationView
    && chatSurfaceStateCache.messages === messages
    && chatSurfaceStateCache.pendingTurn === pendingTurn
    && chatSurfaceStateCache.sdkLiveTurn === sdkLiveTurn
  ) {
    return chatSurfaceStateCache.state;
  }
  const state = {
    messages,
    sdkLiveTurn,
    conversationView,
    pendingTurn,
  };
  chatSurfaceStateCache = {
    conversationView,
    messages,
    pendingTurn,
    sdkLiveTurn,
    state,
  };
  return state;
}

function projectDesktopChatInterfaceState(
  activeWorkspace: DesktopChatWorkspaceProjection,
) {
  const surfaceState = projectDesktopChatSurfaceState({
    activeWorkspace,
  });
  const hasConversationView = Boolean(surfaceState.conversationView);
  const projectedRendererAnnotations = Array.isArray(activeWorkspace.rendererAnnotations)
    ? activeWorkspace.rendererAnnotations
    : emptyRendererAnnotations;
  return {
    messages: surfaceState.messages,
    rendererAnnotations: surfaceState.conversationView
      ? projectedRendererAnnotations
      : emptyRendererAnnotations,
    thinkingStatus: hasConversationView ? null : activeWorkspace.thinkingStatus,
    thinkingSourceEventType: hasConversationView ? null : (activeWorkspace.thinkingSourceEventType ?? null),
    compactionDebugInfo: hasConversationView ? null : (activeWorkspace.compactionDebugInfo ?? null),
    tokenCounts: hasConversationView ? null : (activeWorkspace.tokenCounts ?? null),
    sdkLiveTurn: surfaceState.sdkLiveTurn,
    conversationView: surfaceState.conversationView,
    pendingTurn: surfaceState.pendingTurn,
  };
}

function projectDesktopLiveTurnSurfaceState({
  activeWorkspace,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
}) {
  return projectDesktopChatSurfaceState({
    activeWorkspace,
  });
}

export const DesktopChatSurfaceSelectorRuntime = Object.freeze({
  projectDesktopChatSurfaceState,
  projectDesktopChatInterfaceState,
  projectDesktopLiveTurnSurfaceState,
});
