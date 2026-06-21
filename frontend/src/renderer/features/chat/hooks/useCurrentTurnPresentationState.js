/**
 * Provides the use current turn presentation state module for the renderer UI.
 */

import { useMemo } from 'react';
import { DesktopCurrentTurnPresentationRuntime } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from '../../../app/runtime/desktopVisibleTurnLifecycleRuntime';
import { useChatLoopTransportState } from './useChatLoopUiState';

const {
  findLatestVisibleAssistantReply,
  resolveCurrentTurnPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  buildCurrentTurnPresentationSnapshotSignature,
  isCurrentTurnPresentationOverlayLifecycleBusy,
  resolveCurrentTurnPresentationOverlayLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;

export function useCurrentTurnPresentationState({
  phase,
  isSending,
  messages,
  dismissedResponseId = null,
  allowedTypes,
}) {
  const activeResponse = useMemo(() => findLatestVisibleAssistantReply(
    messages,
    allowedTypes,
  ), [
    allowedTypes,
    messages,
  ]);
  const hasVisibleReply = Boolean(activeResponse);

  const optimisticLifecycle = useMemo(() => resolveCurrentTurnPresentationOverlayLifecycle({
    phase,
    isSending,
    hasVisibleReply,
    transportConnected: true,
  }), [hasVisibleReply, isSending, phase]);

  const transportState = useChatLoopTransportState({
    snapshotSignature: buildCurrentTurnPresentationSnapshotSignature({
      phase,
      isSending,
      hasVisibleReply,
    }),
    isBusy: isCurrentTurnPresentationOverlayLifecycleBusy(optimisticLifecycle),
  });

  const overlayTurnLifecycle = useMemo(() => resolveCurrentTurnPresentationOverlayLifecycle({
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

  const presentationState = useMemo(() => resolveCurrentTurnPresentationState({
    phase,
    lifecycle: overlayTurnLifecycle,
    messages,
    dismissedResponseId,
    allowedTypes,
    activeResponse,
  }), [
    allowedTypes,
    activeResponse,
    dismissedResponseId,
    messages,
    phase,
    overlayTurnLifecycle,
  ]);

  return {
    ...presentationState,
    isTransportConnected: transportState.isTransportConnected,
    overlayTurnLifecycle,
  };
}
