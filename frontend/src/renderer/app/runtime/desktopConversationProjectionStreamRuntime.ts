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
  DesktopCurrentTurnProjectionEffectsRuntime,
  type CurrentTurnProjectionEffectsInput,
  type ProjectionCursor,
} from './desktopCurrentTurnProjectionEffectsRuntime';
import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';
import type {
  SdkDisplayRow,
} from './desktopConversationRuntimeContracts';
import {
  DesktopPresentationSourceChannels,
} from './desktopPresentationSourceChannels';
import {
  DesktopRendererTraceRuntime,
  type RendererReplayTraceValues,
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
  currentTurnProjection?: CurrentTurnLike;
  messages: ChatMessage[];
  pendingTurn?: PendingTurnLike;
  streamTracking: StreamTrackingLike;
  thinkingStatus?: string | null;
};

type CurrentTurnProjectionStreamDeps = {
  getWorkspaceState: (conversationRef?: string | null) => ProjectionWorkspace;
  setCurrentTurnProjection: (
    currentTurn: CurrentTurnProjectionEffectsInput,
    conversationRef?: string | null,
  ) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (sourceEventType: string | null, conversationRef?: string | null) => void;
  updateStreamTracking: (updater: (current: unknown) => unknown, conversationRef?: string | null) => void;
};

type ApplyCurrentTurnProjectionEventInput = {
  conversationRef: string;
  currentTurn: CurrentTurnProjectionEffectsInput;
  deps: CurrentTurnProjectionStreamDeps;
  projectionCursors: Map<string, ProjectionCursor>;
};

type DisplayRowsProjectionStreamDeps = {
  getWorkspaceState: (conversationRef?: string | null) => ProjectionWorkspace;
  setMessages: (messages: ChatMessage[], conversationRef?: string | null) => void;
};

type ApplyDisplayRowsProjectionEventInput = {
  conversationRef: string;
  rows: SdkDisplayRow[];
  deps: DisplayRowsProjectionStreamDeps;
};

type ReplayProjectionTracePayloadInput = {
  action: string;
  conversationRef: string;
  values?: Partial<RendererReplayTraceValues>;
  workspace: ProjectionWorkspace;
};

type DisplayRowsProjectionInput = {
  rows: SdkDisplayRow[];
  workspace: ProjectionWorkspace;
};

const {
  buildChatMessagesFromSdkDisplayRows,
  buildDisplayProjectionTraceSummary,
  mergeRendererAnnotationsIntoSdkMessages,
} = DesktopConversationDisplayProjection;
const {
  recordTrackingEvent,
  shouldIgnoreConversationEventForStaleTurn,
} = DesktopChatStreamEventRuntime;
const {
  applyCurrentTurnProjectionSideEffects,
  buildProjectionCursorKey,
  createProjectionCursor,
  shouldAcceptCurrentTurnBeforeLocalSend,
} = DesktopCurrentTurnProjectionEffectsRuntime;
const {
  logRendererCurrentTurnAppliedTrace,
  logRendererDisplayRowsProjectionTrace,
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
    : normalizeTurnRef(workspace.currentTurnProjection?.turnRef);
  const currentTurnPhase = hasConversationView
    ? viewLiveTurn?.phase ?? null
    : workspace.currentTurnProjection?.phase ?? null;
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
    streamActiveTurnRef: workspace.streamTracking?.activeTurnRef ?? null,
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
  deps.setCurrentTurnProjection(currentTurn, conversationRef);

  const shouldSkipDerivedSideEffects = (
    !shouldAcceptCurrentTurnBeforeLocalSend(currentTurn)
    && shouldIgnoreConversationEventForStaleTurn({
      turnRef: currentTurn.turnRef,
    }, conversationRef, {
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
  projectionCursors.set(cursorKey, applyCurrentTurnProjectionSideEffects({
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

function buildDisplayRowsProjection({
  rows,
  workspace,
}: DisplayRowsProjectionInput): {
  mergedMessages: ChatMessage[];
  shouldApplyMessages: boolean;
  sdkMessages: ChatMessage[];
  traceSummary: Record<string, unknown>;
} {
  const shouldApplyMessages = !workspace.conversationView;
  if (!shouldApplyMessages) {
    return {
      mergedMessages: [],
      shouldApplyMessages,
      sdkMessages: [],
      traceSummary: buildDisplayProjectionTraceSummary({
        rows,
      }),
    };
  }

  const currentMessages = Array.isArray(workspace.messages) ? workspace.messages : [];
  const sdkMessages = buildChatMessagesFromSdkDisplayRows(rows);
  const mergedMessages = mergeRendererAnnotationsIntoSdkMessages(
    sdkMessages,
    currentMessages,
    { pendingTurn: workspace.pendingTurn },
  );
  return {
    mergedMessages,
    shouldApplyMessages,
    sdkMessages,
    traceSummary: buildDisplayProjectionTraceSummary({
      rows,
      sdkMessages,
      currentMessages,
      mergedMessages,
    }),
  };
}

function applyDisplayRowsProjectionEvent({
  conversationRef,
  rows,
  deps,
}: ApplyDisplayRowsProjectionEventInput): void {
  if (!conversationRef) {
    return;
  }
  const workspace = deps.getWorkspaceState(conversationRef);
  const {
    mergedMessages,
    shouldApplyMessages,
    traceSummary,
  } = buildDisplayRowsProjection({ rows, workspace });
  logRendererDisplayRowsProjectionTrace({
    source: 'sdk-display-rows-stream',
    conversationRef,
    ...traceSummary,
  });
  logReplayProjectionTrace('sdk_display_rows_projected', conversationRef, workspace, {
    displayRowCount: rows.length,
    projectedRowCount: rows.length,
    shouldApplyMessages,
  });
  if (!shouldApplyMessages) {
    return;
  }
  deps.setMessages(
    mergedMessages,
    conversationRef,
  );
}

export const DesktopConversationProjectionStreamRuntime = Object.freeze({
  applyCurrentTurnProjectionEvent,
  applyDisplayRowsProjectionEvent,
  buildDisplayRowsProjection,
  buildReplayProjectionTracePayload,
  normalizeTurnRef,
});
