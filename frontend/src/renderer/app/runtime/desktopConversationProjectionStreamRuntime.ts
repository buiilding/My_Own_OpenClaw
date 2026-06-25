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

type StreamTrackingLike = {
  activeTurnRef?: string | null;
  phase: StreamPhase;
};

type ProjectionWorkspace = {
  conversationView?: unknown | null;
  currentTurnProjection?: CurrentTurnLike;
  messages: ChatMessage[];
  pendingTurn?: PendingTurnLike;
  streamTracking: StreamTrackingLike;
  supersededTurnRefs?: Record<string, true>;
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

function isSupersededTurn(
  workspace: ProjectionWorkspace,
  turnRef: string | null | undefined,
): boolean {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  return Boolean(normalizedTurnRef && workspace.supersededTurnRefs?.[normalizedTurnRef]);
}

function rowTurnRef(row: unknown): string | null {
  return row && typeof row === 'object' && !Array.isArray(row)
    ? normalizeTurnRef((row as { turnRef?: string | null }).turnRef)
    : null;
}

function withoutSupersededRows<TRow>(
  rows: TRow[],
  workspace: ProjectionWorkspace,
): TRow[] {
  if (!workspace.supersededTurnRefs || Object.keys(workspace.supersededTurnRefs).length === 0) {
    return rows;
  }
  return rows.filter((row) => !isSupersededTurn(workspace, rowTurnRef(row)));
}

function buildReplayProjectionTracePayload({
  action,
  conversationRef,
  workspace,
  values = {},
}: ReplayProjectionTracePayloadInput): RendererReplayTraceValues {
  const pendingTurnRef = normalizeTurnRef(workspace.pendingTurn?.turnRef);
  const currentTurnRef = normalizeTurnRef(workspace.currentTurnProjection?.turnRef);
  return {
    action,
    conversationRef,
    pendingTurnRef,
    currentTurnRef,
    currentTurnPhase: workspace.currentTurnProjection?.phase ?? null,
    streamActiveTurnRef: workspace.streamTracking?.activeTurnRef ?? null,
    streamPhase: workspace.streamTracking?.phase ?? null,
    messageCount: Array.isArray(workspace.messages) ? workspace.messages.length : 0,
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
  if (isSupersededTurn(preProjectionWorkspace, currentTurn.turnRef)) {
    logReplayProjectionTrace('sdk_current_turn_superseded_ignored', conversationRef, preProjectionWorkspace, {
      oldTurnRef: currentTurn.turnRef ?? null,
      currentTurnRef: currentTurn.turnRef ?? null,
      currentTurnPhase: currentTurn.phase ?? null,
    });
    return;
  }

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
  filteredRows: SdkDisplayRow[];
  mergedMessages: ChatMessage[];
  shouldApplyMessages: boolean;
  sdkMessages: ChatMessage[];
  traceSummary: Record<string, unknown>;
} {
  const currentMessages = Array.isArray(workspace.messages) ? workspace.messages : [];
  const shouldApplyMessages = !workspace.conversationView;
  const filteredRows = withoutSupersededRows(rows, workspace);
  const sdkMessages = buildChatMessagesFromSdkDisplayRows(filteredRows);
  const mergedMessages = mergeRendererAnnotationsIntoSdkMessages(
    sdkMessages,
    currentMessages,
    { pendingTurn: workspace.pendingTurn },
  );
  return {
    filteredRows,
    mergedMessages,
    shouldApplyMessages,
    sdkMessages,
    traceSummary: buildDisplayProjectionTraceSummary({
      rows: filteredRows,
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
    filteredRows,
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
    replacementRowCount: filteredRows.length,
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
  isSupersededTurn,
  normalizeTurnRef,
  withoutSupersededRows,
});
