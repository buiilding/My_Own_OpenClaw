/**
 * Shared renderer stop-turn handler.
 */

import { useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { DesktopLiveTurnRuntimeClient } from '../../../app/runtime/desktopLiveTurnRuntimeClient';
import { IpcBridge, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { resolveStopTurnTarget } from '../utils/state/stopQueryState';

export function useStopTurnHandler({
  enabled = true,
  currentTurnProjection = null,
  pendingTurn = null,
  sessionConversationRef = null,
  stopPlayback = null,
  warningContext = 'StopTurnHandler',
} = {}) {
  const acceptStoppedTurn = useChatStore((state) => state.acceptStoppedTurn);
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const stopTarget = useMemo(() => resolveStopTurnTarget({
    currentTurnProjection,
    pendingTurn,
    conversationRef: sessionConversationRef,
  }), [
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
      currentTurnProjection: stopTarget.source === 'sdk-current-turn'
        ? currentTurnProjection
        : null,
    });
    if (typeof stopPlayback === 'function') {
      stopPlayback();
    }
    if (stopTarget.source === 'pending-turn') {
      try {
        IpcBridge.send(SEND_CHANNELS.WINDIE_PENDING_TURN, {
          type: 'clear',
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
