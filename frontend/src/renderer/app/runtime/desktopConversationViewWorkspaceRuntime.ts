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

type ResolveConversationViewStoreRefInput = {
  activeConversationRef?: string | null;
  targetConversationRef?: string | null;
  view?: unknown;
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

function exactNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isConversationView(value: unknown): value is ConversationView {
  if (!isObjectRecord(value)) {
    return false;
  }
  const source = value as Partial<ConversationView>;
  return exactNonEmptyString(source.conversationRef) !== null
    && Array.isArray(source.displayRows)
    && isObjectRecord(source.liveTurn)
    && isObjectRecord(source.surfaces)
    && isObjectRecord(source.actions);
}

function normalizeConversationView(value: unknown): ConversationView | null {
  return isConversationView(value) ? value : null;
}

function hasWorkspaceConversationView(workspace: unknown): boolean {
  return Boolean(
    workspace
      && typeof workspace === 'object'
      && !Array.isArray(workspace)
      && isConversationView((workspace as ConversationViewWorkspace).conversationView),
  );
}

function readConversationViewLiveTurnRef(conversationView: unknown): string | null {
  return isConversationView(conversationView)
    ? exactNonEmptyString(conversationView.liveTurn.turnRef)
    : null;
}

function resolveConversationViewStoreRef({
  activeConversationRef = null,
  targetConversationRef = null,
  view = null,
}: ResolveConversationViewStoreRefInput = {}): string | null {
  if (!isConversationView(view)) {
    return null;
  }
  const viewConversationRef = exactNonEmptyString(view.conversationRef);
  if (!viewConversationRef) {
    return null;
  }
  const targetRef = exactNonEmptyString(targetConversationRef);
  if (
    targetConversationRef !== null
    && targetConversationRef !== undefined
    && targetRef !== viewConversationRef
  ) {
    return null;
  }
  const activeRef = exactNonEmptyString(activeConversationRef);
  if (
    !targetRef
    && activeConversationRef !== null
    && activeConversationRef !== undefined
    && activeRef !== viewConversationRef
  ) {
    return null;
  }
  return viewConversationRef;
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
    const id = exactNonEmptyString(source.id);
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

function shouldClearRawMessagesForConversationView(
  conversationView: unknown,
  currentWorkspace: ConversationViewWorkspace,
): boolean {
  return Boolean(
    isConversationView(conversationView)
      && Array.isArray(currentWorkspace.messages)
      && currentWorkspace.messages.length > 0,
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
  const conversationRef = exactNonEmptyString(source.conversationRef);
  const turnRef = exactNonEmptyString(source.turnRef);
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
  const conversationRef = exactNonEmptyString(conversationView.conversationRef);
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
    exactNonEmptyString(liveTurn?.turnRef)
    || exactNonEmptyString(responseOverlay?.turnRef)
  );
  const phase = exactNonEmptyString(liveTurn?.phase);
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
  conversationView: unknown;
  currentWorkspace: TWorkspace;
}): ConversationViewWorkspaceMutation<TWorkspace> | null {
  const normalizedConversationView = normalizeConversationView(conversationView);
  const hasWorkspaceUpdate = currentWorkspace.conversationView !== normalizedConversationView;
  const shouldClearPendingTurn = shouldClearPendingTurnForConversationView(
    currentWorkspace.pendingTurn,
    normalizedConversationView,
  );
  const nextRendererAnnotations = normalizedConversationView
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
  const shouldClearRawMessages = shouldClearRawMessagesForConversationView(
    normalizedConversationView,
    currentWorkspace,
  );

  if (
    !hasWorkspaceUpdate
    && !shouldClearPendingTurn
    && !hasRendererAnnotationUpdate
    && !shouldClearRawMessages
  ) {
    return null;
  }

  return {
    workspace: hasWorkspaceUpdate
      || shouldClearPendingTurn
      || hasRendererAnnotationUpdate
      || shouldClearRawMessages
      ? {
        ...currentWorkspace,
        conversationView: normalizedConversationView,
        ...(shouldClearRawMessages ? {
          messages: [],
        } : {}),
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
  conversationView: unknown;
  deps: ConversationViewStateDependencies<TState, TWorkspace>;
  state: TState;
}): Partial<TState> | TState | null {
  const normalizedConversationView = normalizeConversationView(conversationView);
  const targetWorkspaceRef = deps.resolveWorkspaceKey(
    conversationRef ?? normalizedConversationView?.conversationRef,
    state.activeConversationRef,
  );
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  const conversationViewMutation = buildConversationViewWorkspaceMutation({
    conversationView: normalizedConversationView,
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
  normalizeConversationView,
  readConversationViewLiveTurnRef,
  resolveConversationViewStoreRef,
  shouldClearPendingTurnForConversationView,
});
