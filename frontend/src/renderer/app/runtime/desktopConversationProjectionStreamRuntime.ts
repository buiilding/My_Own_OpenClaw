import type {
  ChatMessage,
} from './desktopChatMessageTypes';
import {
  DesktopChatStreamEventRuntime,
} from './desktopChatStreamEventRuntime';
import type {
  StreamPhase,
} from './desktopChatStreamTrackingRuntime';
import {
  DesktopSdkLiveTurnEffectsRuntime,
  type SdkLiveTurnEffectsInput,
  type ProjectionCursor,
} from './desktopSdkLiveTurnEffectsRuntime';
import {
  DesktopPresentationSourceChannels,
} from './desktopPresentationSourceChannels';
import {
  type RendererReplayTraceValues,
  DesktopRendererTraceRuntime,
} from './desktopRendererTraceRuntime';

type PendingTurnLike = {
  turnRef?: string | null;
} | null | undefined;

type CurrentTurnLike = {
  phase?: string | null;
  turnRef?: string | null;
} | null | undefined;

type ConversationViewLike = {
  displayRows?: unknown[] | null;
  liveTurn?: {
    phase?: string | null;
    turnRef?: string | null;
  } | null;
} | null | undefined;

type StreamTrackingLike = {
  activeTurnRef?: string | null;
  phase: StreamPhase;
};

type ProjectionWorkspace = {
  conversationView?: ConversationViewLike;
  messages: ChatMessage[];
  pendingTurn?: PendingTurnLike;
  sdkLiveTurn?: CurrentTurnLike;
  streamTracking: StreamTrackingLike;
  thinkingStatus?: string | null;
};

type CurrentTurnProjectionStreamDeps = {
  getWorkspaceState: (conversationRef?: string | null) => ProjectionWorkspace;
  setNoViewSdkLiveTurn: (
    currentTurn: SdkLiveTurnEffectsInput,
    conversationRef?: string | null,
  ) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (sourceEventType: string | null, conversationRef?: string | null) => void;
  updateStreamTracking: (updater: (current: unknown) => unknown, conversationRef?: string | null) => void;
};

type ApplyCurrentTurnProjectionEventInput = {
  conversationRef: string;
  currentTurn: SdkLiveTurnEffectsInput;
  deps: CurrentTurnProjectionStreamDeps;
  projectionCursors: Map<string, ProjectionCursor>;
};

type ReplayProjectionTracePayloadInput = {
  action: string;
  conversationRef: string;
  values?: Partial<RendererReplayTraceValues>;
  workspace: ProjectionWorkspace;
};

const {
  recordTrackingEvent,
  resolveConversationStreamEventIdentity,
  shouldIgnoreConversationEventIdentityForStaleTurn,
} = DesktopChatStreamEventRuntime;
const {
  applySdkLiveTurnSideEffects,
  buildProjectionCursorKey,
  createProjectionCursor,
  shouldAcceptCurrentTurnBeforeLocalSend,
} = DesktopSdkLiveTurnEffectsRuntime;
const {
  logRendererCurrentTurnAppliedTrace,
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;

const sdkCurrentTurnSourceChannel = DesktopPresentationSourceChannels.getSdkCurrentTurnSourceChannel();

function normalizeTurnRef(turnRef: string | null | undefined): string | null {
  return typeof turnRef === 'string' && turnRef.trim()
    ? turnRef.trim()
    : null;
}

function isConversationView(value: ConversationViewLike): value is NonNullable<ConversationViewLike> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildReplayProjectionTracePayload({
  action,
  conversationRef,
  workspace,
  values = {},
}: ReplayProjectionTracePayloadInput): RendererReplayTraceValues {
  const pendingTurnRef = normalizeTurnRef(workspace.pendingTurn?.turnRef);
  const hasConversationView = isConversationView(workspace.conversationView);
  const viewLiveTurn = hasConversationView ? workspace.conversationView.liveTurn ?? null : null;
  const currentTurnRef = hasConversationView
    ? normalizeTurnRef(viewLiveTurn?.turnRef)
    : normalizeTurnRef(workspace.sdkLiveTurn?.turnRef);
  const currentTurnPhase = hasConversationView
    ? viewLiveTurn?.phase ?? null
    : workspace.sdkLiveTurn?.phase ?? null;
  const streamActiveTurnRef = hasConversationView
    ? currentTurnRef
    : normalizeTurnRef(workspace.streamTracking?.activeTurnRef);
  const messageCount = hasConversationView
    ? 0
    : Array.isArray(workspace.messages) ? workspace.messages.length : 0;
  const displayRowCount = hasConversationView && Array.isArray(workspace.conversationView?.displayRows)
    ? workspace.conversationView.displayRows.length
    : 0;
  return {
    action,
    conversationRef,
    pendingTurnRef,
    currentTurnRef,
    currentTurnPhase,
    streamActiveTurnRef,
    streamPhase: workspace.streamTracking?.phase ?? null,
    messageCount,
    displayRowCount,
    pendingPresent: Boolean(pendingTurnRef),
    pendingMatchesNewTurn: Boolean(
      pendingTurnRef
        && typeof values.newTurnRef === 'string'
        && pendingTurnRef === values.newTurnRef,
    ),
    currentMatchesNewTurn: Boolean(
      currentTurnRef
        && typeof values.newTurnRef === 'string'
        && currentTurnRef === values.newTurnRef,
    ),
    currentMatchesOldTurn: Boolean(
      currentTurnRef
        && typeof values.oldTurnRef === 'string'
        && currentTurnRef === values.oldTurnRef,
    ),
    ...values,
  };
}

function logReplayProjectionTrace(
  action: string,
  conversationRef: string,
  workspace: ProjectionWorkspace,
  values: Partial<RendererReplayTraceValues> = {},
): void {
  logRendererReplayTrace(buildReplayProjectionTracePayload({
    action,
    conversationRef,
    workspace,
    values,
  }));
}

function applyCurrentTurnProjectionEvent({
  conversationRef,
  currentTurn,
  deps,
  projectionCursors,
}: ApplyCurrentTurnProjectionEventInput): void {
  if (!currentTurn || !conversationRef) {
    return;
  }

  const preProjectionWorkspace = deps.getWorkspaceState(conversationRef);
  // Check stale-turn status before current-turn storage can resolve pendingTurn.
  deps.setNoViewSdkLiveTurn(currentTurn, conversationRef);

  const currentTurnIdentity = resolveConversationStreamEventIdentity(
    currentTurn,
    conversationRef,
  );
  const shouldSkipDerivedSideEffects = (
    !shouldAcceptCurrentTurnBeforeLocalSend(currentTurn)
    && shouldIgnoreConversationEventIdentityForStaleTurn(currentTurnIdentity, conversationRef, {
      getWorkspaceState: () => preProjectionWorkspace,
    })
  );
  logRendererCurrentTurnAppliedTrace({
    source: sdkCurrentTurnSourceChannel,
    conversationRef,
    currentTurn,
    skipDerivedSideEffects: shouldSkipDerivedSideEffects,
  });
  if (shouldSkipDerivedSideEffects) {
    logReplayProjectionTrace('sdk_current_turn_stale_side_effects_skipped', conversationRef, deps.getWorkspaceState(conversationRef), {
      newTurnRef: currentTurn.turnRef ?? null,
      currentTurnRef: currentTurn.turnRef ?? null,
      currentTurnPhase: currentTurn.phase ?? null,
    });
    return;
  }

  const cursorKey = buildProjectionCursorKey(conversationRef, currentTurn.turnRef ?? null);
  const previousCursor = projectionCursors.get(cursorKey) ?? createProjectionCursor();
  projectionCursors.set(cursorKey, applySdkLiveTurnSideEffects({
    conversationRef,
    currentTurn,
    cursor: previousCursor,
    deps: {
      getWorkspaceState: deps.getWorkspaceState,
      setIsSending: deps.setIsSending,
      setThinkingStatus: deps.setThinkingStatus,
      setThinkingSourceEventType: deps.setThinkingSourceEventType,
      updateStreamTracking: deps.updateStreamTracking,
      recordTrackingEvent,
    },
  }));
  logReplayProjectionTrace('sdk_current_turn_applied', conversationRef, deps.getWorkspaceState(conversationRef), {
    newTurnRef: currentTurn.turnRef ?? null,
    currentTurnRef: currentTurn.turnRef ?? null,
    currentTurnPhase: currentTurn.phase ?? null,
  });
}

export const DesktopConversationProjectionStreamRuntime = Object.freeze({
  applyCurrentTurnProjectionEvent,
  buildReplayProjectionTracePayload,
  normalizeTurnRef,
});
