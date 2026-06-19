/**
 * Provides shared chat surface selector projection rules for renderer UI surfaces.
 */

type DesktopChatWorkspaceProjection = {
  messages: unknown[];
  isSending: boolean;
  thinkingStatus: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: unknown | null;
  tokenCounts?: unknown | null;
  streamTracking: unknown;
  currentTurnProjection?: unknown | null;
  pendingTurn?: unknown | null;
};

export function projectDesktopChatInterfaceState(
  activeWorkspace: DesktopChatWorkspaceProjection,
) {
  return {
    messages: activeWorkspace.messages,
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType ?? null,
    compactionDebugInfo: activeWorkspace.compactionDebugInfo ?? null,
    tokenCounts: activeWorkspace.tokenCounts ?? null,
    streamTracking: activeWorkspace.streamTracking,
    currentTurnProjection: activeWorkspace.currentTurnProjection ?? null,
    pendingTurn: activeWorkspace.pendingTurn ?? null,
  };
}

export function projectDesktopLiveTurnSurfaceState({
  activeWorkspace,
  latestCurrentTurnProjection,
}: {
  activeWorkspace: DesktopChatWorkspaceProjection;
  latestCurrentTurnProjection?: unknown | null;
}) {
  return {
    messages: activeWorkspace.messages,
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType ?? null,
    currentTurnProjection: latestCurrentTurnProjection || activeWorkspace.currentTurnProjection || null,
    pendingTurn: activeWorkspace.pendingTurn ?? null,
  };
}
