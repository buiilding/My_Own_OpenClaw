import type { ConversationView } from './desktopConversationRuntimeContracts';
import {
  DesktopConversationDisplayRowLookupRuntime,
} from './desktopConversationDisplayRowLookupRuntime';

const {
  findConversationViewUserDisplayRowForTurn,
} = DesktopConversationDisplayRowLookupRuntime;

type ConversationViewWorkspace = {
  conversationView: ConversationView | null;
  isSending?: boolean;
  messages?: unknown[];
  pendingTurn?: unknown | null;
  rendererAnnotations?: RendererAnnotationRecord[];
};

type ConversationViewWorkspaceMutation<TWorkspace extends ConversationViewWorkspace> = {
  workspace: TWorkspace;
};

type RendererAnnotationRecord = {
  feedback?: unknown;
  id: string;
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

function isConversationView(value: unknown): value is ConversationView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const source = value as Partial<ConversationView>;
  return typeof source.conversationRef === 'string'
    && Array.isArray(source.displayRows)
    && Boolean(source.liveTurn && typeof source.liveTurn === 'object')
    && Boolean(source.surfaces && typeof source.surfaces === 'object')
    && Boolean(source.actions && typeof source.actions === 'object');
}

function hasWorkspaceConversationView(workspace: unknown): boolean {
  return Boolean(
    workspace
      && typeof workspace === 'object'
      && !Array.isArray(workspace)
      && isConversationView((workspace as ConversationViewWorkspace).conversationView),
  );
}

function hasRendererFeedbackAnnotation(value: unknown): boolean {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (value as Record<string, unknown>).sender === 'assistant'
      && Object.prototype.hasOwnProperty.call(value, 'feedback'),
  );
}

function selectRendererAnnotationsFromMessages(messages: unknown[] | undefined): RendererAnnotationRecord[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.flatMap((message) => {
    if (!hasRendererFeedbackAnnotation(message)) {
      return [];
    }
    const source = message as Record<string, unknown>;
    const id = normalizeString(source.id);
    return id
      ? [{
        id,
        feedback: source.feedback,
      }]
      : [];
  });
}

function mergeRendererAnnotations(
  currentAnnotations: RendererAnnotationRecord[] | undefined,
  messageAnnotations: RendererAnnotationRecord[],
): RendererAnnotationRecord[] {
  const nextAnnotations = Array.isArray(currentAnnotations)
    ? [...currentAnnotations]
    : [];
  const annotationIndexes = new Map(
    nextAnnotations.map((annotation, index) => [annotation.id, index]),
  );
  for (const annotation of messageAnnotations) {
    const existingIndex = annotationIndexes.get(annotation.id);
    if (existingIndex === undefined) {
      annotationIndexes.set(annotation.id, nextAnnotations.length);
      nextAnnotations.push(annotation);
    }
  }
  return nextAnnotations;
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
  const hasSameTurnUserDisplayRow = Boolean(
    findConversationViewUserDisplayRowForTurn(conversationView, turnRef),
  );
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
  const nextRendererAnnotations = conversationView
    ? mergeRendererAnnotations(
      currentWorkspace.rendererAnnotations,
      selectRendererAnnotationsFromMessages(currentWorkspace.messages),
    )
    : [];
  const hasRendererAnnotationUpdate = currentWorkspace.rendererAnnotations !== nextRendererAnnotations
    && (
      (currentWorkspace.rendererAnnotations?.length ?? 0) !== nextRendererAnnotations.length
      || nextRendererAnnotations.some((annotation, index) => (
        currentWorkspace.rendererAnnotations?.[index] !== annotation
      ))
    );

  if (!hasWorkspaceUpdate && !shouldClearPendingTurn && !hasRendererAnnotationUpdate) {
    return null;
  }

  return {
    workspace: hasWorkspaceUpdate || shouldClearPendingTurn || hasRendererAnnotationUpdate
      ? {
        ...currentWorkspace,
        conversationView,
        ...(hasRendererAnnotationUpdate ? {
          rendererAnnotations: nextRendererAnnotations,
        } : {}),
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
