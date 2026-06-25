/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
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
import {
  DesktopConversationProjectionStreamRuntime,
} from '../../../app/runtime/desktopConversationProjectionStreamRuntime';

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
  buildDisplayRowsProjection,
  buildReplayProjectionTracePayload,
  isSupersededTurn,
} = DesktopConversationProjectionStreamRuntime;
const {
  logRendererCurrentTurnAppliedTrace,
  logRendererDisplayRowsProjectionTrace,
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;

function logReplayProjectionTrace(
  action: string,
  conversationRef: string,
  workspace: Parameters<typeof buildReplayProjectionTracePayload>[0]['workspace'],
  values: Record<string, unknown> = {},
): void {
  logRendererReplayTrace(buildReplayProjectionTracePayload({
    action,
    conversationRef,
    workspace,
    values,
  }));
}

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map<string, ProjectionCursor>());
  const setMessages = useChatStore((state) => state.setMessages);
  const setCurrentTurnProjection = useChatStore((state) => state.setCurrentTurnProjection);
  const applyPendingTurnBroadcast = useChatStore((state) => state.applyPendingTurnBroadcast);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);

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
      const { currentTurn, conversationRef } = event;
      if (!currentTurn || !conversationRef) {
        return;
      }

      const preProjectionWorkspace = useChatStore.getState().getWorkspaceState(conversationRef);
      if (isSupersededTurn(preProjectionWorkspace, currentTurn.turnRef)) {
        logReplayProjectionTrace('sdk_current_turn_superseded_ignored', conversationRef, preProjectionWorkspace, {
          oldTurnRef: currentTurn.turnRef ?? null,
          currentTurnRef: currentTurn.turnRef ?? null,
          currentTurnPhase: currentTurn.phase ?? null,
        });
        return;
      }

      // Check stale-turn status before current-turn storage can resolve pendingTurn.
      setCurrentTurnProjection(currentTurn, conversationRef);

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
        logReplayProjectionTrace('sdk_current_turn_stale_side_effects_skipped', conversationRef, useChatStore.getState().getWorkspaceState(conversationRef), {
          newTurnRef: currentTurn.turnRef ?? null,
          currentTurnRef: currentTurn.turnRef ?? null,
          currentTurnPhase: currentTurn.phase ?? null,
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
      const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
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
      setMessages(
        mergedMessages,
        conversationRef,
      );
    });
    return () => {
      removeListener?.();
    };
  }, [setMessages]);
}
