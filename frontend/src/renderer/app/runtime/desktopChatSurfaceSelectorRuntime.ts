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

function projectDesktopChatSurfaceState({
  activeWorkspace,
  conversationView,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
  conversationView?: unknown | null;
}) {
  const resolvedConversationView = conversationView ?? activeWorkspace.conversationView ?? null;
  const projectedMessages = resolvedConversationView && !activeWorkspace.pendingTurn
    ? []
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
  return {
    messages: activeWorkspace.messages,
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
  latestConversationView,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
  latestConversationView?: unknown | null;
}) {
  const conversationView = latestConversationView || activeWorkspace.conversationView || null;
  return projectDesktopChatSurfaceState({
    activeWorkspace,
    conversationView,
  });
}

export const DesktopChatSurfaceSelectorRuntime = Object.freeze({
  projectDesktopChatSurfaceState,
  projectDesktopChatInterfaceState,
  projectDesktopLiveTurnSurfaceState,
});
