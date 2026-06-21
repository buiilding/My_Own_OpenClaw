/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
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
} = DesktopRendererTraceRuntime;

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
      logRendererCurrentTurnAppliedTrace({
        source: sdkCurrentTurnSourceChannel,
        conversationRef,
        currentTurn,
        skipDerivedSideEffects: shouldSkipDerivedSideEffects,
      });
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
      const mergedMessages = mergeRendererAnnotationsIntoSdkMessages(sdkMessages, workspace.messages);
      logRendererDisplayRowsProjectionTrace({
        source: 'sdk-display-rows-stream',
        conversationRef,
        ...buildDisplayProjectionTraceSummary({
          rows,
          sdkMessages,
          currentMessages: workspace.messages,
          mergedMessages,
        }),
      });
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
