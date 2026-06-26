import type {
  CurrentTurnProjection,
} from './desktopConversationRuntimeContracts';
import type {
  NoViewSdkLiveTurnStorage,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopChatWorkspaceStateRuntime,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopVisibleTurnLifecycleRuntime,
} from './desktopVisibleTurnLifecycleRuntime';

const {
  buildNoViewSdkLiveTurnStorageUpdate,
  readNoViewSdkLiveTurnStorage,
} = DesktopChatWorkspaceStateRuntime;
const {
  resolvePendingTurnForSdkLiveTurn,
} = DesktopVisibleTurnLifecycleRuntime;

type CurrentTurnWorkspace = NoViewSdkLiveTurnStorage & {
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

function buildNoViewSdkLiveTurnWorkspaceMutation<TWorkspace extends CurrentTurnWorkspace>({
  currentWorkspace,
  sdkLiveTurn,
}: {
  currentWorkspace: TWorkspace;
  sdkLiveTurn: CurrentTurnProjection | null;
}): TWorkspace | null {
  const currentSdkLiveTurn = readNoViewSdkLiveTurnStorage(currentWorkspace);
  if (hasConversationView(currentWorkspace.conversationView)) {
    return currentSdkLiveTurn === null
      ? null
      : buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, null);
  }
  const nextPendingTurn = resolvePendingTurnForSdkLiveTurn({
    pendingTurn: currentWorkspace.pendingTurn,
    sdkLiveTurn,
  });
  if (
    currentSdkLiveTurn === sdkLiveTurn
    && currentWorkspace.pendingTurn === nextPendingTurn
  ) {
    return null;
  }
  return {
    ...buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, sdkLiveTurn),
    pendingTurn: nextPendingTurn,
  };
}

function buildSetNoViewSdkLiveTurnStorageStateUpdate<
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
  const nextWorkspace = buildNoViewSdkLiveTurnWorkspaceMutation({
    currentWorkspace,
    sdkLiveTurn,
  });
  if (!nextWorkspace) {
    return null;
  }
  return deps.buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
}

function buildSetNoViewSdkLiveTurnStateUpdate<
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
  return buildSetNoViewSdkLiveTurnStorageStateUpdate({
    conversationRef,
    deps,
    sdkLiveTurn,
    state,
  });
}

export const DesktopCurrentTurnWorkspaceRuntime = Object.freeze({
  buildNoViewSdkLiveTurnWorkspaceMutation,
  buildSetNoViewSdkLiveTurnStateUpdate,
});
