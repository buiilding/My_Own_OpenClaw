/**
 * Provides the use overlay turn lifecycle module for the renderer UI.
 */

import { useMemo } from 'react';
import { useChatLoopTransportState } from './useChatLoopUiState';
import {
  isOverlayTurnLifecycleBusy,
  resolveOverlayTurnLifecycle,
} from '../../../app/runtime/desktopOverlayTurnLifecycleRuntime';

export function useOverlayTurnLifecycle({
  phase,
  isSending,
  hasVisibleReply = false,
  recoveryWatchdogMs,
}) {
  const optimisticLifecycle = useMemo(() => resolveOverlayTurnLifecycle({
    phase,
    isSending,
    hasVisibleReply,
    transportConnected: true,
  }), [hasVisibleReply, isSending, phase]);

  const transportState = useChatLoopTransportState({
    snapshotSignature: [
      phase || 'idle',
      isSending ? '1' : '0',
      hasVisibleReply ? '1' : '0',
    ].join('|'),
    isBusy: isOverlayTurnLifecycleBusy(optimisticLifecycle),
    recoveryWatchdogMs,
  });

  const lifecycle = useMemo(() => resolveOverlayTurnLifecycle({
    phase,
    isSending,
    hasVisibleReply,
    transportConnected: transportState.isPresentationTransportConnected,
  }), [
    hasVisibleReply,
    isSending,
    phase,
    transportState.isPresentationTransportConnected,
  ]);

  return {
    lifecycle,
    isTransportConnected: transportState.isTransportConnected,
    isPresentationTransportConnected: transportState.isPresentationTransportConnected,
  };
}
