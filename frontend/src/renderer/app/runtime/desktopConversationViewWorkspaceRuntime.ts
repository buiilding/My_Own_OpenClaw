import type { ConversationView } from './desktopConversationRuntimeContracts';

type ConversationViewWorkspace = {
  conversationView: ConversationView | null;
  isSending?: boolean;
  pendingTurn?: unknown | null;
};

type ConversationViewWorkspaceMutation<TWorkspace extends ConversationViewWorkspace> = {
  workspace: TWorkspace;
  hasLatestConversationViewUpdate: boolean;
  latestConversationView: ConversationView | null;
};

type ConversationViewStateSnapshot = {
  activeConversationRef: string | null;
  latestConversationView: ConversationView | null;
};

type ConversationViewStateDependencies<
  TState extends ConversationViewStateSnapshot,
  TWorkspace extends ConversationViewWorkspace,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
    extraState?: Partial<TState>,
  ) => Partial<TState> | TState;
  isActiveWorkspaceRef: (state: TState, workspaceRef: string) => boolean;
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePendingTurn(value: unknown): {
  conversationRef: string;
  turnRef: string;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const conversationRef = normalizeString(source.conversationRef);
  const turnRef = normalizeString(source.turnRef);
  return conversationRef && turnRef
    ? { conversationRef, turnRef }
    : null;
}

function normalizeConversationViewLiveTurn(conversationView: ConversationView | null): {
  conversationRef: string;
  turnRef: string;
  isAuthoritative: boolean;
} | null {
  if (!conversationView || typeof conversationView !== 'object') {
    return null;
  }
  const conversationRef = normalizeString(conversationView.conversationRef);
  const liveTurn = conversationView.liveTurn && typeof conversationView.liveTurn === 'object'
    ? conversationView.liveTurn as Record<string, unknown>
    : null;
  const surfaces = conversationView.surfaces && typeof conversationView.surfaces === 'object'
    ? conversationView.surfaces as Record<string, unknown>
    : null;
  const responseOverlay = surfaces?.responseOverlay && typeof surfaces.responseOverlay === 'object'
    ? surfaces.responseOverlay as Record<string, unknown>
    : null;
  const turnRef = (
    normalizeString(liveTurn?.turnRef)
    || normalizeString(responseOverlay?.turnRef)
  );
  const phase = normalizeString(liveTurn?.phase);
  const responseMode = normalizeString(responseOverlay?.mode);
  const entries = Array.isArray(liveTurn?.entries) ? liveTurn.entries : [];
  const isAuthoritative = Boolean(
    responseMode === 'awaiting'
      || responseMode === 'typing'
      || responseMode === 'response'
      || liveTurn?.isBusy === true
      || liveTurn?.isTerminal === true
      || entries.length > 0
      || phase === 'awaiting'
      || phase === 'streaming'
      || phase === 'tool_call'
      || phase === 'tool_output'
      || phase === 'complete'
      || phase === 'error'
  );
  return conversationRef && turnRef
    ? { conversationRef, turnRef, isAuthoritative }
    : null;
}

function shouldClearPendingTurnForConversationView(
  pendingTurn: unknown,
  conversationView: ConversationView | null,
): boolean {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  const normalizedViewTurn = normalizeConversationViewLiveTurn(conversationView);
  return Boolean(
    normalizedPendingTurn
      && normalizedViewTurn?.isAuthoritative
      && normalizedPendingTurn.conversationRef === normalizedViewTurn.conversationRef
      && normalizedPendingTurn.turnRef === normalizedViewTurn.turnRef,
  );
}

function buildConversationViewWorkspaceMutation<TWorkspace extends ConversationViewWorkspace>({
  conversationView,
  currentWorkspace,
  isActiveWorkspace,
  latestConversationView,
}: {
  conversationView: ConversationView | null;
  currentWorkspace: TWorkspace;
  isActiveWorkspace: boolean;
  latestConversationView: ConversationView | null;
}): ConversationViewWorkspaceMutation<TWorkspace> | null {
  const hasWorkspaceUpdate = currentWorkspace.conversationView !== conversationView;
  const shouldClearPendingTurn = shouldClearPendingTurnForConversationView(
    currentWorkspace.pendingTurn,
    conversationView,
  );
  const hasLatestConversationViewUpdate = (
    isActiveWorkspace
    && latestConversationView !== conversationView
  );

  if (!hasWorkspaceUpdate && !shouldClearPendingTurn && !hasLatestConversationViewUpdate) {
    return null;
  }

  return {
    workspace: hasWorkspaceUpdate || shouldClearPendingTurn
      ? {
        ...currentWorkspace,
        conversationView,
        ...(shouldClearPendingTurn ? {
          pendingTurn: null,
          isSending: false,
        } : {}),
      }
      : currentWorkspace,
    hasLatestConversationViewUpdate,
    latestConversationView: hasLatestConversationViewUpdate
      ? conversationView
      : latestConversationView,
  };
}

function buildSetConversationViewStateUpdate<
  TState extends ConversationViewStateSnapshot,
  TWorkspace extends ConversationViewWorkspace,
>({
  conversationRef = null,
  conversationView,
  deps,
  state,
}: {
  conversationRef?: string | null;
  conversationView: ConversationView | null;
  deps: ConversationViewStateDependencies<TState, TWorkspace>;
  state: TState;
}): Partial<TState> | TState | null {
  const targetWorkspaceRef = deps.resolveWorkspaceKey(
    conversationRef ?? conversationView?.conversationRef,
    state.activeConversationRef,
  );
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  const conversationViewMutation = buildConversationViewWorkspaceMutation({
    conversationView,
    currentWorkspace,
    isActiveWorkspace: deps.isActiveWorkspaceRef(state, targetWorkspaceRef),
    latestConversationView: state.latestConversationView,
  });
  if (!conversationViewMutation) {
    return null;
  }
  const latestConversationViewUpdate = conversationViewMutation.hasLatestConversationViewUpdate
    ? { latestConversationView: conversationViewMutation.latestConversationView } as Partial<TState>
    : {};
  if (conversationViewMutation.workspace === currentWorkspace) {
    return latestConversationViewUpdate;
  }
  return deps.buildWorkspaceUpdate(
    state,
    targetWorkspaceRef,
    conversationViewMutation.workspace,
    latestConversationViewUpdate,
  );
}

export const DesktopConversationViewWorkspaceRuntime = Object.freeze({
  buildConversationViewWorkspaceMutation,
  buildSetConversationViewStateUpdate,
  shouldClearPendingTurnForConversationView,
});
