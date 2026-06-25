import type {
  CurrentTurnProjection,
} from './desktopConversationRuntimeContracts';
import {
  DesktopVisibleTurnLifecycleRuntime,
} from './desktopVisibleTurnLifecycleRuntime';

const {
  resolvePendingTurnForCurrentProjection,
} = DesktopVisibleTurnLifecycleRuntime;

type CurrentTurnWorkspace = {
  currentTurnProjection: CurrentTurnProjection | null;
  pendingTurn: unknown | null;
};

function buildCurrentTurnWorkspaceMutation<TWorkspace extends CurrentTurnWorkspace>({
  currentTurnProjection,
  currentWorkspace,
}: {
  currentTurnProjection: CurrentTurnProjection | null;
  currentWorkspace: TWorkspace;
}): TWorkspace | null {
  const nextPendingTurn = resolvePendingTurnForCurrentProjection({
    pendingTurn: currentWorkspace.pendingTurn,
    currentTurnProjection,
  });
  if (
    currentWorkspace.currentTurnProjection === currentTurnProjection
    && currentWorkspace.pendingTurn === nextPendingTurn
  ) {
    return null;
  }
  return {
    ...currentWorkspace,
    currentTurnProjection,
    pendingTurn: nextPendingTurn,
  };
}

export const DesktopCurrentTurnWorkspaceRuntime = Object.freeze({
  buildCurrentTurnWorkspaceMutation,
});
