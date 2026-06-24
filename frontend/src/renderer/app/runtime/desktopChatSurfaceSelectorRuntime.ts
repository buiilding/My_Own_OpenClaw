/**
 * Provides shared chat surface selector projection rules for renderer UI surfaces.
 */

type DesktopChatWorkspaceProjection = {
  messages: unknown[];
  thinkingStatus: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: unknown | null;
  tokenCounts?: unknown | null;
  currentTurnProjection?: unknown | null;
  conversationView?: unknown | null;
  pendingTurn?: unknown | null;
};

function projectDesktopChatInterfaceState(
  activeWorkspace: DesktopChatWorkspaceProjection,
) {
  return {
    messages: activeWorkspace.messages,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType ?? null,
    compactionDebugInfo: activeWorkspace.compactionDebugInfo ?? null,
    tokenCounts: activeWorkspace.tokenCounts ?? null,
    currentTurnProjection: activeWorkspace.currentTurnProjection ?? null,
    conversationView: activeWorkspace.conversationView ?? null,
    pendingTurn: activeWorkspace.pendingTurn ?? null,
  };
}

function projectDesktopLiveTurnSurfaceState({
  activeWorkspace,
  latestCurrentTurnProjection,
  latestConversationView,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
  latestCurrentTurnProjection?: unknown | null;
  latestConversationView?: unknown | null;
}) {
  const conversationView = latestConversationView || activeWorkspace.conversationView || null;
  return {
    messages: activeWorkspace.messages,
    currentTurnProjection: conversationView
      ? null
      : latestCurrentTurnProjection || activeWorkspace.currentTurnProjection || null,
    conversationView,
    pendingTurn: activeWorkspace.pendingTurn ?? null,
  };
}

export const DesktopChatSurfaceSelectorRuntime = Object.freeze({
  projectDesktopChatInterfaceState,
  projectDesktopLiveTurnSurfaceState,
});
