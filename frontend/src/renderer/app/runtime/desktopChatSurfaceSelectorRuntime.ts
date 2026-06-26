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
  conversationView?: unknown | null;
  pendingTurn?: unknown | null;
  rendererAnnotations?: unknown[];
  sdkLiveTurn?: unknown | null;
};

const emptyRendererAnnotations: unknown[] = [];
function projectDesktopChatSurfaceState({
  activeWorkspace,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
}) {
  const conversationView = activeWorkspace.conversationView ?? null;
  return {
    messages: activeWorkspace.messages,
    sdkLiveTurn: activeWorkspace.sdkLiveTurn ?? null,
    conversationView,
    pendingTurn: activeWorkspace.pendingTurn ?? null,
  };
}

function projectDesktopChatInterfaceState(
  activeWorkspace: DesktopChatWorkspaceProjection,
) {
  const surfaceState = projectDesktopChatSurfaceState({
    activeWorkspace,
  });
  const projectedRendererAnnotations = Array.isArray(activeWorkspace.rendererAnnotations)
    ? activeWorkspace.rendererAnnotations
    : emptyRendererAnnotations;
  return {
    messages: surfaceState.messages,
    rendererAnnotations: surfaceState.conversationView
      ? projectedRendererAnnotations
      : emptyRendererAnnotations,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType ?? null,
    compactionDebugInfo: activeWorkspace.compactionDebugInfo ?? null,
    tokenCounts: activeWorkspace.tokenCounts ?? null,
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
