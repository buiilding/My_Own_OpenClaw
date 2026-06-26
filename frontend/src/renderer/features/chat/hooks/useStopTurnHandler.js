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
  isStopTurnTargetFromPendingTurn,
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
    if (!enabled || !stopTarget.canStop) {
      return false;
    }
    if (stopTarget.conversationRef) {
      setActiveConversationRef(stopTarget.conversationRef);
    }
    acceptStoppedTurnInChatStore({
      conversationRef: stopTarget.conversationRef,
      turnRef: stopTarget.turnRef,
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
