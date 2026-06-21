/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import {
  buildChatMessagesFromSdkDisplayRows,
  mergeRendererAnnotationsIntoSdkMessages,
} from '../../../app/runtime/desktopConversationDisplayProjection';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  shouldIgnoreConversationEventForStaleTurn,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import { DesktopConversationRuntimeEventClient } from '../../../app/runtime/desktopConversationRuntimeEventClient';
import { logRendererLiveSurfaceTrace } from '../../../app/runtime/desktopRendererTraceRuntime';
import { getSdkCurrentTurnSourceChannel } from '../../../app/runtime/desktopPresentationSourceChannels';
import {
  applyCurrentTurnProjectionSideEffects,
  buildProjectionCursorKey,
  createProjectionCursor,
  shouldAcceptCurrentTurnBeforeLocalSend,
  type ProjectionCursor,
} from '../../../app/runtime/desktopCurrentTurnProjectionEffectsRuntime';

const sdkCurrentTurnSourceChannel = getSdkCurrentTurnSourceChannel();

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map<string, ProjectionCursor>());
  const setMessages = useChatStore((state) => state.setMessages);
  const setCurrentTurnProjection = useChatStore((state) => state.setCurrentTurnProjection);
  const setLatestCurrentTurnProjection = useChatStore((state) => state.setLatestCurrentTurnProjection);
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

      setLatestCurrentTurnProjection(currentTurn);
      setCurrentTurnProjection(currentTurn, conversationRef);

      const shouldSkipDerivedSideEffects = (
        !shouldAcceptCurrentTurnBeforeLocalSend(currentTurn)
        && shouldIgnoreConversationEventForStaleTurn({
          turnRef: currentTurn.turnRef,
        }, conversationRef, {
          getWorkspaceState: useChatStore.getState().getWorkspaceState,
        })
      );
      logRendererLiveSurfaceTrace('renderer.current_turn.applied', {
        source: sdkCurrentTurnSourceChannel,
        turnRef: currentTurn.turnRef ?? null,
        conversationRef,
        phase: currentTurn.phase,
        overlayMode: currentTurn.presentation?.overlayIntent?.mode ?? null,
        guardRef: currentTurn.presentation?.overlayIntent?.staleGuardRef
          ?? currentTurn.presentation?.overlayIntent?.turnRef
          ?? currentTurn.turnRef
          ?? null,
        typingVisible: currentTurn.presentation?.typingVisible === true,
        overlayVisible: currentTurn.presentation?.overlayVisible === true,
        hasVisibleContent: currentTurn.presentation?.hasVisibleContent === true,
        entryCount: Array.isArray(currentTurn.presentation?.entries)
          ? currentTurn.presentation.entries.length
          : 0,
        assistantLength: typeof currentTurn.assistantText === 'string'
          ? currentTurn.assistantText.length
          : 0,
        reasoningLength: typeof currentTurn.reasoningText === 'string'
          ? currentTurn.reasoningText.length
          : 0,
        toolEventCount: Array.isArray(currentTurn.toolEvents) ? currentTurn.toolEvents.length : 0,
        staleSideEffectsSkipped: shouldSkipDerivedSideEffects,
      }, conversationRef);
      if (shouldSkipDerivedSideEffects) {
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
    });
    return () => {
      removeListener?.();
    };
  }, [
    setCurrentTurnProjection,
    setLatestCurrentTurnProjection,
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
      const sdkMessages = buildChatMessagesFromSdkDisplayRows(rows);
      const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
      setMessages(
        mergeRendererAnnotationsIntoSdkMessages(sdkMessages, workspace.messages),
        conversationRef,
      );
    });
    return () => {
      removeListener?.();
    };
  }, [setMessages]);
}
