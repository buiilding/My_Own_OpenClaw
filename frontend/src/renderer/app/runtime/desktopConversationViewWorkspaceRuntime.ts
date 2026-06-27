import type { ConversationView } from './desktopConversationRuntimeContracts';

type ConversationViewWorkspace = {
  conversationView: ConversationView | null;
  isSending?: boolean;
  pendingTurn?: unknown | null;
};

type ConversationViewWorkspaceMutation<TWorkspace extends ConversationViewWorkspace> = {
  workspace: TWorkspace;
};

type ConversationViewStateSnapshot = {
  activeConversationRef: string | null;
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
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasWorkspaceConversationView(workspace: unknown): boolean {
  return Boolean(
    workspace
      && typeof workspace === 'object'
      && !Array.isArray(workspace)
      && (workspace as ConversationViewWorkspace).conversationView
      && typeof (workspace as ConversationViewWorkspace).conversationView === 'object',
  );
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
  hasVisibleReplacement: boolean;
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
  const entries = Array.isArray(liveTurn?.entries) ? liveTurn.entries : [];
  const displayRows = Array.isArray(conversationView.displayRows)
    ? conversationView.displayRows
    : [];
  const hasSameTurnUserDisplayRow = displayRows.some((row) => (
    row
      && typeof row === 'object'
      && (
        row.role === 'user'
        || row.type === 'user_message'
      )
      && normalizeString(row.turnRef) === turnRef
  ));
  const hasVisibleReplacement = Boolean(
    hasSameTurnUserDisplayRow
      || entries.length > 0
      || liveTurn?.isTerminal === true
      || phase === 'complete'
      || phase === 'error'
  );
  return conversationRef && turnRef
    ? { conversationRef, turnRef, hasVisibleReplacement }
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
      && normalizedViewTurn?.hasVisibleReplacement
      && normalizedPendingTurn.conversationRef === normalizedViewTurn.conversationRef
      && normalizedPendingTurn.turnRef === normalizedViewTurn.turnRef,
  );
}

function buildConversationViewWorkspaceMutation<TWorkspace extends ConversationViewWorkspace>({
  conversationView,
  currentWorkspace,
}: {
  conversationView: ConversationView | null;
  currentWorkspace: TWorkspace;
}): ConversationViewWorkspaceMutation<TWorkspace> | null {
  const hasWorkspaceUpdate = currentWorkspace.conversationView !== conversationView;
  const shouldClearPendingTurn = shouldClearPendingTurnForConversationView(
    currentWorkspace.pendingTurn,
    conversationView,
  );

  if (!hasWorkspaceUpdate && !shouldClearPendingTurn) {
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
  });
  if (!conversationViewMutation) {
    return null;
  }
  if (conversationViewMutation.workspace === currentWorkspace) {
    return null;
  }
  return deps.buildWorkspaceUpdate(
    state,
    targetWorkspaceRef,
    conversationViewMutation.workspace,
  );
}

export const DesktopConversationViewWorkspaceRuntime = Object.freeze({
  buildConversationViewWorkspaceMutation,
  buildSetConversationViewStateUpdate,
  hasWorkspaceConversationView,
  shouldClearPendingTurnForConversationView,
});
