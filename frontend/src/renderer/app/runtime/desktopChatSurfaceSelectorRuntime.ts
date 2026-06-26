/**
 * Provides shared chat surface selector projection rules for renderer UI surfaces.
 */

import type { ChatMessage } from './desktopChatMessageTypes';

type DesktopChatWorkspaceProjection = {
  messages: ChatMessage[];
  thinkingStatus: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: unknown | null;
  tokenCounts?: unknown | null;
  currentTurnProjection?: unknown | null;
  conversationView?: unknown | null;
  pendingTurn?: unknown | null;
  rendererAnnotations?: unknown[];
};

const emptyRendererAnnotations: unknown[] = [];

function projectDesktopChatSurfaceState({
  activeWorkspace,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
}) {
  return {
    messages: activeWorkspace.messages,
    currentTurnProjection: activeWorkspace.currentTurnProjection ?? null,
    conversationView: activeWorkspace.conversationView ?? null,
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
  const projectedRendererAnnotations = Array.isArray(activeWorkspace.rendererAnnotations)
    ? activeWorkspace.rendererAnnotations
    : emptyRendererAnnotations;
  return {
    messages: surfaceState.messages,
    rendererAnnotations: hasConversationView
      ? projectedRendererAnnotations
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
