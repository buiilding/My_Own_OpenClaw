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
  conversationView?: unknown | null;
  pendingTurn: unknown | null;
};

type CurrentTurnStateSnapshot = {
  activeConversationRef: string | null;
};

type CurrentTurnStateDependencies<
  TState extends CurrentTurnStateSnapshot,
  TWorkspace extends CurrentTurnWorkspace,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
  ) => Partial<TState> | TState;
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

function hasConversationView(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildCurrentTurnWorkspaceMutation<TWorkspace extends CurrentTurnWorkspace>({
  currentTurnProjection,
  currentWorkspace,
}: {
  currentTurnProjection: CurrentTurnProjection | null;
  currentWorkspace: TWorkspace;
}): TWorkspace | null {
  if (hasConversationView(currentWorkspace.conversationView)) {
    return currentWorkspace.currentTurnProjection === null
      ? null
      : {
        ...currentWorkspace,
        currentTurnProjection: null,
      };
  }
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

function buildSetCurrentTurnProjectionStateUpdate<
  TState extends CurrentTurnStateSnapshot,
  TWorkspace extends CurrentTurnWorkspace,
>({
  conversationRef = null,
  currentTurnProjection,
  deps,
  state,
}: {
  conversationRef?: string | null;
  currentTurnProjection: CurrentTurnProjection | null;
  deps: CurrentTurnStateDependencies<TState, TWorkspace>;
  state: TState;
}): Partial<TState> | TState | null {
  const targetWorkspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  const nextWorkspace = buildCurrentTurnWorkspaceMutation({
    currentWorkspace,
    currentTurnProjection,
  });
  if (!nextWorkspace) {
    return null;
  }
  return deps.buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
}

function buildSetSdkLiveTurnStateUpdate<
  TState extends CurrentTurnStateSnapshot,
  TWorkspace extends CurrentTurnWorkspace,
>({
  conversationRef = null,
  deps,
  sdkLiveTurn,
  state,
}: {
  conversationRef?: string | null;
  deps: CurrentTurnStateDependencies<TState, TWorkspace>;
  sdkLiveTurn: CurrentTurnProjection | null;
  state: TState;
}): Partial<TState> | TState | null {
  return buildSetCurrentTurnProjectionStateUpdate({
    conversationRef,
    currentTurnProjection: sdkLiveTurn,
    deps,
    state,
  });
}

export const DesktopCurrentTurnWorkspaceRuntime = Object.freeze({
  buildCurrentTurnWorkspaceMutation,
  buildSetSdkLiveTurnStateUpdate,
});
