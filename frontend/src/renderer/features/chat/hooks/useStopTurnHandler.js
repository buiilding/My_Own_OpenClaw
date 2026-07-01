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
  executeStopTurnExecutionPlan,
} = DesktopStopTurnRuntime;

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
    return null;
  }, [stopTurnTarget]);

  const handleStopTurn = useCallback(() => executeStopTurnExecutionPlan({
    deps: {
      acceptStoppedTurn: acceptStoppedTurnInChatStore,
      clearPendingTurn: DesktopPendingTurnRuntimeClient.clear,
      setActiveConversationRef,
      stopLiveTurn: DesktopLiveTurnRuntimeClient.stop,
      stopPlayback,
    },
    enabled,
    stopTarget,
    warningContext,
  }), [
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
