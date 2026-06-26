/**
 * Shared renderer stop-turn handler.
 */

import { useCallback, useMemo } from 'react';
import {
  useChatStore,
} from '../stores/chatStore';
import {
  acceptStoppedTurnInChatStore,
} from '../stores/chatStoreAdapters';
import { DesktopLiveTurnRuntimeClient } from '../../../app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopPendingTurnRuntimeClient } from '../../../app/runtime/desktopPendingTurnRuntimeClient';
import {
  DesktopStopTurnRuntime,
} from '../../../app/runtime/desktopStopTurnRuntime';

const {
  buildStopTurnExecutionPlan,
} = DesktopStopTurnRuntime;

const IDLE_STOP_TURN_TARGET = Object.freeze({
  source: 'idle',
  conversationRef: null,
  turnRef: null,
  canStop: false,
});

export function useStopTurnHandler({
  enabled = true,
  stopTurnTarget = null,
  stopPlayback = null,
  warningContext = 'StopTurnHandler',
} = {}) {
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const stopTarget = useMemo(() => {
    if (stopTurnTarget && typeof stopTurnTarget === 'object') {
      return stopTurnTarget;
    }
    return IDLE_STOP_TURN_TARGET;
  }, [stopTurnTarget]);

  const handleStopTurn = useCallback(() => {
    const stopPlan = buildStopTurnExecutionPlan(stopTarget);
    if (!enabled || !stopPlan.canStop) {
      return false;
    }
    if (stopPlan.conversationRef) {
      setActiveConversationRef(stopPlan.conversationRef);
    }
    acceptStoppedTurnInChatStore({
      conversationRef: stopPlan.conversationRef,
      turnRef: stopPlan.turnRef,
    });
    if (typeof stopPlayback === 'function') {
      stopPlayback();
    }
    if (stopPlan.shouldClearPendingBridge) {
      try {
        DesktopPendingTurnRuntimeClient.clear({
          conversationRef: stopPlan.conversationRef,
          turnRef: stopPlan.turnRef,
        });
      } catch (error) {
        console.warn(`[${warningContext}] Failed to clear pending turn before stop:`, error);
      }
    }
    void Promise.resolve(DesktopLiveTurnRuntimeClient.stop(
      stopPlan.conversationRef,
      stopPlan.turnRef,
    )).catch((error) => {
      console.warn(`[${warningContext}] Failed to stop query:`, error);
    });
    return true;
  }, [
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
