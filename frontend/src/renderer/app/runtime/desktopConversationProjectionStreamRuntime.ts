import type {
  ChatMessage,
} from './desktopChatMessageTypes';
import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';
import type {
  SdkDisplayRow,
} from './desktopConversationRuntimeContracts';

type PendingTurnLike = {
  turnRef?: string | null;
} | null | undefined;

type CurrentTurnLike = {
  phase?: string | null;
  turnRef?: string | null;
} | null | undefined;

type StreamTrackingLike = {
  activeTurnRef?: string | null;
  phase?: string | null;
} | null | undefined;

type ProjectionWorkspace = {
  currentTurnProjection?: CurrentTurnLike;
  messages?: ChatMessage[];
  pendingTurn?: PendingTurnLike;
  streamTracking?: StreamTrackingLike;
  supersededTurnRefs?: Record<string, true>;
};

type ReplayProjectionTracePayloadInput = {
  action: string;
  conversationRef: string;
  values?: Record<string, unknown>;
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
}: ReplayProjectionTracePayloadInput): Record<string, unknown> {
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
    ...values,
  };
}

function buildDisplayRowsProjection({
  rows,
  workspace,
}: DisplayRowsProjectionInput): {
  filteredRows: SdkDisplayRow[];
  mergedMessages: ChatMessage[];
  sdkMessages: ChatMessage[];
  traceSummary: Record<string, unknown>;
} {
  const currentMessages = Array.isArray(workspace.messages) ? workspace.messages : [];
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
    sdkMessages,
    traceSummary: buildDisplayProjectionTraceSummary({
      rows: filteredRows,
      sdkMessages,
      currentMessages,
      mergedMessages,
    }),
  };
}

export const DesktopConversationProjectionStreamRuntime = Object.freeze({
  buildDisplayRowsProjection,
  buildReplayProjectionTracePayload,
  isSupersededTurn,
  normalizeTurnRef,
  withoutSupersededRows,
});
