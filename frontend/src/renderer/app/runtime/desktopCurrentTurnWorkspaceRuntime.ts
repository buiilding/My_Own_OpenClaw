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
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';
import {
  DesktopVisibleTurnLifecycleRuntime,
} from './desktopVisibleTurnLifecycleRuntime';

const {
  buildNoViewSdkLiveTurnStorageUpdate,
  readNoViewSdkLiveTurnStorage,
} = DesktopChatWorkspaceStateRuntime;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;
const {
  resolvePendingTurnForSdkLiveTurn,
} = DesktopVisibleTurnLifecycleRuntime;

const CURRENT_TURN_PROJECTION_PHASES = new Set([
  'idle',
  'awaiting',
  'streaming',
  'tool_call',
  'tool_output',
  'complete',
  'error',
]);

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

function exactNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isCurrentTurnProjection(value: unknown): value is CurrentTurnProjection {
  if (!isObjectRecord(value)) {
    return false;
  }
  const phase = exactNonEmptyString(value.phase);
  const turnRef = value.turnRef;
  return Boolean(
    exactNonEmptyString(value.conversationRef)
      && phase
      && CURRENT_TURN_PROJECTION_PHASES.has(phase)
      && (
        turnRef === null
        || turnRef === undefined
        || exactNonEmptyString(turnRef)
      ),
  );
}

function normalizeNoViewSdkLiveTurn(value: unknown): CurrentTurnProjection | null {
  return isCurrentTurnProjection(value) ? value : null;
}

function buildNoViewSdkLiveTurnWorkspaceMutation<TWorkspace extends CurrentTurnWorkspace>({
  currentWorkspace,
  sdkLiveTurn,
}: {
  currentWorkspace: TWorkspace;
  sdkLiveTurn: unknown;
}): TWorkspace | null {
  const nextSdkLiveTurn = normalizeNoViewSdkLiveTurn(sdkLiveTurn);
  const currentSdkLiveTurn = readNoViewSdkLiveTurnStorage(currentWorkspace);
  if (hasWorkspaceConversationView(currentWorkspace)) {
    return currentSdkLiveTurn === null
      ? null
      : buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, null);
  }
  const nextPendingTurn = resolvePendingTurnForSdkLiveTurn({
    pendingTurn: currentWorkspace.pendingTurn,
    sdkLiveTurn: nextSdkLiveTurn,
  });
  if (
    currentSdkLiveTurn === nextSdkLiveTurn
    && currentWorkspace.pendingTurn === nextPendingTurn
  ) {
    return null;
  }
  return {
    ...buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, nextSdkLiveTurn),
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
  sdkLiveTurn: unknown;
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
  sdkLiveTurn: unknown;
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
