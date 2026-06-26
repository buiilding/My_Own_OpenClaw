import type {
  CurrentTurnProjection,
} from './desktopConversationRuntimeContracts';
import {
  DesktopVisibleTurnLifecycleRuntime,
} from './desktopVisibleTurnLifecycleRuntime';

const {
  resolvePendingTurnForSdkLiveTurn,
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

function buildSdkLiveTurnWorkspaceMutation<TWorkspace extends CurrentTurnWorkspace>({
  currentWorkspace,
  sdkLiveTurn,
}: {
  currentWorkspace: TWorkspace;
  sdkLiveTurn: CurrentTurnProjection | null;
}): TWorkspace | null {
  if (hasConversationView(currentWorkspace.conversationView)) {
    return currentWorkspace.currentTurnProjection === null
      ? null
      : {
        ...currentWorkspace,
        currentTurnProjection: null,
      };
  }
  const nextPendingTurn = resolvePendingTurnForSdkLiveTurn({
    pendingTurn: currentWorkspace.pendingTurn,
    sdkLiveTurn,
  });
  if (
    currentWorkspace.currentTurnProjection === sdkLiveTurn
    && currentWorkspace.pendingTurn === nextPendingTurn
  ) {
    return null;
  }
  return {
    ...currentWorkspace,
    currentTurnProjection: sdkLiveTurn,
    pendingTurn: nextPendingTurn,
  };
}

function buildSetSdkLiveTurnStorageStateUpdate<
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
  const targetWorkspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  const nextWorkspace = buildSdkLiveTurnWorkspaceMutation({
    currentWorkspace,
    sdkLiveTurn,
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
  return buildSetSdkLiveTurnStorageStateUpdate({
    conversationRef,
    deps,
    sdkLiveTurn,
    state,
  });
}

export const DesktopCurrentTurnWorkspaceRuntime = Object.freeze({
  buildSdkLiveTurnWorkspaceMutation,
  buildSetSdkLiveTurnStateUpdate,
});
