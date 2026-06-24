/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import {
  DesktopConversationDisplayProjection,
} from '../../../app/runtime/desktopConversationDisplayProjection';
import {
  DesktopChatStreamEventRuntime,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import { DesktopConversationRuntimeEventClient } from '../../../app/runtime/desktopConversationRuntimeEventClient';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';
import { DesktopPresentationSourceChannels } from '../../../app/runtime/desktopPresentationSourceChannels';
import {
  DesktopCurrentTurnProjectionEffectsRuntime,
  type ProjectionCursor,
} from '../../../app/runtime/desktopCurrentTurnProjectionEffectsRuntime';
import type { ChatWorkspaceState } from '../stores/chatWorkspaceState';

const sdkCurrentTurnSourceChannel = DesktopPresentationSourceChannels.getSdkCurrentTurnSourceChannel();
const {
  recordTrackingEvent: recordTrackingEventRuntime,
  shouldIgnoreConversationEventForStaleTurn,
} = DesktopChatStreamEventRuntime;
const {
  applyCurrentTurnProjectionSideEffects,
  buildProjectionCursorKey,
  createProjectionCursor,
  shouldAcceptCurrentTurnBeforeLocalSend,
} = DesktopCurrentTurnProjectionEffectsRuntime;
const {
  buildChatMessagesFromSdkDisplayRows,
  buildDisplayProjectionTraceSummary,
  mergeRendererAnnotationsIntoSdkMessages,
} = DesktopConversationDisplayProjection;
const {
  logRendererCurrentTurnAppliedTrace,
  logRendererDisplayRowsProjectionTrace,
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;

function normalizeTurnRef(turnRef: string | null | undefined): string | null {
  return typeof turnRef === 'string' && turnRef.trim()
    ? turnRef.trim()
    : null;
}

function isSupersededTurn(workspace: ChatWorkspaceState, turnRef: string | null | undefined): boolean {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  return Boolean(normalizedTurnRef && workspace.supersededTurnRefs?.[normalizedTurnRef]);
}

function rowTurnRef(row: unknown): string | null {
  return row && typeof row === 'object' && !Array.isArray(row)
    ? normalizeTurnRef((row as { turnRef?: string | null }).turnRef)
    : null;
}

function withoutSupersededRows<TRow>(rows: TRow[], workspace: ChatWorkspaceState): TRow[] {
  if (!workspace.supersededTurnRefs || Object.keys(workspace.supersededTurnRefs).length === 0) {
    return rows;
  }
  return rows.filter((row) => !isSupersededTurn(workspace, rowTurnRef(row)));
}

function readConversationViewDisplayRows(view: unknown): unknown[] | null {
  if (!view || typeof view !== 'object' || !('displayRows' in view)) {
    return null;
  }
  const rows = (view as { displayRows?: unknown }).displayRows;
  return Array.isArray(rows) ? rows : null;
}

function logReplayProjectionTrace(
  action: string,
  conversationRef: string,
  workspace: ChatWorkspaceState,
  values: Record<string, unknown> = {},
): void {
  const pendingTurnRef = normalizeTurnRef(workspace.pendingTurn?.turnRef);
  const currentTurnRef = normalizeTurnRef(workspace.currentTurnProjection?.turnRef);
  logRendererReplayTrace({
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
  });
}

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map<string, ProjectionCursor>());
  const setMessages = useChatStore((state) => state.setMessages);
  const setCurrentTurnProjection = useChatStore((state) => state.setCurrentTurnProjection);
  const setConversationView = useChatStore((state) => state.setConversationView);
  const applyPendingTurnBroadcast = useChatStore((state) => state.applyPendingTurnBroadcast);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  const applyDisplayRowsProjection = useCallback((
    rows: unknown[],
    conversationRef: string,
    source: string,
    replayAction: string,
  ): void => {
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const filteredRows = withoutSupersededRows(rows, workspace);
    const sdkMessages = buildChatMessagesFromSdkDisplayRows(filteredRows);
    const mergedMessages = mergeRendererAnnotationsIntoSdkMessages(
      sdkMessages,
      workspace.messages,
      { pendingTurn: workspace.pendingTurn },
    );
    logRendererDisplayRowsProjectionTrace({
      source,
      conversationRef,
      ...buildDisplayProjectionTraceSummary({
        rows: filteredRows,
        sdkMessages,
        currentMessages: workspace.messages,
        mergedMessages,
      }),
    });
    logReplayProjectionTrace(replayAction, conversationRef, workspace, {
      displayRowCount: rows.length,
      replacementRowCount: filteredRows.length,
    });
    setMessages(
      mergedMessages,
      conversationRef,
    );
  }, [setMessages]);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onPendingTurn((action) => {
      applyPendingTurnBroadcast(action);
    });
    return () => {
      removeListener?.();
    };
  }, [applyPendingTurnBroadcast]);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onCurrentTurnProjection((event) => {
      const { currentTurn, view, conversationRef } = event;
      if ((!currentTurn && !view) || !conversationRef) {
        return;
      }

      const preProjectionWorkspace = useChatStore.getState().getWorkspaceState(conversationRef);
      const turnRef = currentTurn?.turnRef ?? view?.liveTurn?.turnRef ?? null;
      if (isSupersededTurn(preProjectionWorkspace, turnRef)) {
        logReplayProjectionTrace('sdk_current_turn_superseded_ignored', conversationRef, preProjectionWorkspace, {
          oldTurnRef: turnRef,
          currentTurnRef: turnRef,
          currentTurnPhase: currentTurn?.phase ?? view?.liveTurn?.phase ?? null,
        });
        return;
      }

      // Check stale-turn status before current-turn storage can resolve pendingTurn.
      setCurrentTurnProjection(currentTurn, conversationRef);
      setConversationView(view, conversationRef);
      const viewDisplayRows = readConversationViewDisplayRows(view);
      if (viewDisplayRows) {
        applyDisplayRowsProjection(
          viewDisplayRows,
          conversationRef,
          'sdk-conversation-view',
          'sdk_view_display_rows_projected',
        );
      }

      const shouldSkipDerivedSideEffects = currentTurn
        ? (
          !shouldAcceptCurrentTurnBeforeLocalSend(currentTurn)
          && shouldIgnoreConversationEventForStaleTurn({
            turnRef: currentTurn.turnRef,
          }, conversationRef, {
            getWorkspaceState: () => preProjectionWorkspace,
          })
        )
        : false;
      logRendererCurrentTurnAppliedTrace({
        source: sdkCurrentTurnSourceChannel,
        conversationRef,
        currentTurn,
        skipDerivedSideEffects: shouldSkipDerivedSideEffects,
      });
      if (shouldSkipDerivedSideEffects || !currentTurn) {
        logReplayProjectionTrace('sdk_current_turn_stale_side_effects_skipped', conversationRef, useChatStore.getState().getWorkspaceState(conversationRef), {
          newTurnRef: currentTurn?.turnRef ?? view?.liveTurn?.turnRef ?? null,
          currentTurnRef: currentTurn?.turnRef ?? view?.liveTurn?.turnRef ?? null,
          currentTurnPhase: currentTurn?.phase ?? view?.liveTurn?.phase ?? null,
        });
        return;
      }

      const cursorKey = buildProjectionCursorKey(conversationRef, currentTurn.turnRef ?? null);
      const previousCursor = projectionCursorsRef.current.get(cursorKey) ?? createProjectionCursor();
      projectionCursorsRef.current.set(cursorKey, applyCurrentTurnProjectionSideEffects({
        conversationRef,
        currentTurn,
        cursor: previousCursor,
        deps: {
          getWorkspaceState: useChatStore.getState().getWorkspaceState,
          setIsSending,
          setThinkingStatus,
          setThinkingSourceEventType,
          updateStreamTracking,
          recordTrackingEvent: recordTrackingEventRuntime,
        },
      }));
      logReplayProjectionTrace('sdk_current_turn_applied', conversationRef, useChatStore.getState().getWorkspaceState(conversationRef), {
        newTurnRef: currentTurn.turnRef ?? null,
        currentTurnRef: currentTurn.turnRef ?? null,
        currentTurnPhase: currentTurn.phase ?? null,
      });
    });
    return () => {
      removeListener?.();
    };
  }, [
    applyDisplayRowsProjection,
    setConversationView,
    setCurrentTurnProjection,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateStreamTracking,
  ]);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onDisplayRowsProjection((event) => {
      const { rows, conversationRef } = event;
      if (!conversationRef) {
        return;
      }
      applyDisplayRowsProjection(
        rows,
        conversationRef,
        'sdk-display-rows-stream',
        'sdk_display_rows_projected',
      );
    });
    return () => {
      removeListener?.();
    };
  }, [applyDisplayRowsProjection]);
}
