/**
 * Provides shared chat surface selector projection rules for renderer UI surfaces.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';

type DesktopChatWorkspaceProjection = {
  messages: ChatMessage[];
  thinkingStatus: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: unknown | null;
  tokenCounts?: unknown | null;
  currentTurnProjection?: unknown | null;
  conversationView?: unknown | null;
  pendingTurn?: unknown | null;
};

const emptyChatMessages: ChatMessage[] = [];
const emptyRendererAnnotations: unknown[] = [];

const {
  selectRendererMessageAnnotations,
} = DesktopConversationDisplayProjection;

function projectDesktopChatSurfaceState({
  activeWorkspace,
  conversationView,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
  conversationView?: unknown | null;
}) {
  const resolvedConversationView = conversationView ?? activeWorkspace.conversationView ?? null;
  const projectedMessages = resolvedConversationView
    ? emptyChatMessages
    : activeWorkspace.messages;
  return {
    messages: projectedMessages,
    currentTurnProjection: resolvedConversationView
      ? null
      : activeWorkspace.currentTurnProjection ?? null,
    conversationView: resolvedConversationView,
    pendingTurn: activeWorkspace.pendingTurn ?? null,
  };
}

function projectDesktopChatInterfaceState(
  activeWorkspace: DesktopChatWorkspaceProjection,
) {
  const surfaceState = projectDesktopChatSurfaceState({
    activeWorkspace,
  });
  const hasConversationView = Boolean(surfaceState.conversationView);
  return {
    messages: surfaceState.messages,
    rendererAnnotations: hasConversationView
      ? selectRendererMessageAnnotations(activeWorkspace.messages)
      : emptyRendererAnnotations,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType ?? null,
    compactionDebugInfo: activeWorkspace.compactionDebugInfo ?? null,
    tokenCounts: activeWorkspace.tokenCounts ?? null,
    currentTurnProjection: surfaceState.currentTurnProjection,
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
