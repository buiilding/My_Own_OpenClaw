/**
 * Shared renderer stop-turn handler.
 */

import { useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { DesktopLiveTurnRuntimeClient } from '../../../app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopPendingTurnRuntimeClient } from '../../../app/runtime/desktopPendingTurnRuntimeClient';
import {
  DesktopStopTurnRuntime,
} from '../../../app/runtime/desktopStopTurnRuntime';

const {
  isStopTurnTargetFromConversationView,
  isStopTurnTargetFromCurrentTurn,
  isStopTurnTargetFromPendingTurn,
  resolveStopTurnTarget,
} = DesktopStopTurnRuntime;

export function useStopTurnHandler({
  enabled = true,
  conversationView = null,
  currentTurnProjection = null,
  pendingTurn = null,
  sessionConversationRef = null,
  stopPlayback = null,
  warningContext = 'StopTurnHandler',
} = {}) {
  const acceptStoppedTurn = useChatStore((state) => state.acceptStoppedTurn);
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const stopTarget = useMemo(() => resolveStopTurnTarget({
    conversationView,
    currentTurnProjection,
    pendingTurn,
    conversationRef: sessionConversationRef,
  }), [
    conversationView,
    currentTurnProjection,
    pendingTurn,
    sessionConversationRef,
  ]);

  const handleStopTurn = useCallback(() => {
    if (!enabled || !stopTarget.canStop) {
      return false;
    }
    if (stopTarget.conversationRef) {
      setActiveConversationRef(stopTarget.conversationRef);
    }
    acceptStoppedTurn({
      conversationRef: stopTarget.conversationRef,
      turnRef: stopTarget.turnRef,
      currentTurnProjection: (
        isStopTurnTargetFromCurrentTurn(stopTarget)
        || (
          isStopTurnTargetFromConversationView(stopTarget)
          && currentTurnProjection?.turnRef === stopTarget.turnRef
        )
      )
        ? currentTurnProjection
        : null,
    });
    if (typeof stopPlayback === 'function') {
      stopPlayback();
    }
    if (isStopTurnTargetFromPendingTurn(stopTarget)) {
      try {
        DesktopPendingTurnRuntimeClient.clear({
          conversationRef: stopTarget.conversationRef,
          turnRef: stopTarget.turnRef,
        });
      } catch (error) {
        console.warn(`[${warningContext}] Failed to clear pending turn before stop:`, error);
      }
    }
    void Promise.resolve(DesktopLiveTurnRuntimeClient.stop(
      stopTarget.conversationRef,
      stopTarget.turnRef,
    )).catch((error) => {
      console.warn(`[${warningContext}] Failed to stop query:`, error);
    });
    return true;
  }, [
    acceptStoppedTurn,
    currentTurnProjection,
    enabled,
    setActiveConversationRef,
    stopPlayback,
    stopTarget,
    warningContext,
  ]);

  return {
    stopTarget,
    handleStopTurn,
  };
}
