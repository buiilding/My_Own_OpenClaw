import { useMemo } from 'react';
import {
  resolveCurrentTurnPresentationState,
} from '../utils/state/chatTurnPresentationState';
import { useChatLoopTransportState } from './useChatLoopUiState';

export function useCurrentTurnPresentationState({
  phase,
  isSending,
  messages,
  dismissedResponseId = null,
  allowedTypes,
}) {
  const optimisticPresentationState = useMemo(() => resolveCurrentTurnPresentationState({
    phase,
    isSending,
    messages,
    dismissedResponseId,
    allowedTypes,
    transportConnected: true,
  }), [
    allowedTypes,
    dismissedResponseId,
    isSending,
    messages,
    phase,
  ]);

  const loopTransportState = useChatLoopTransportState({
    snapshotSignature: [
      phase || 'idle',
      isSending ? '1' : '0',
      optimisticPresentationState.hasVisibleReply ? '1' : '0',
    ].join('|'),
    isBusy: optimisticPresentationState.isBusy,
  });

  const presentationState = useMemo(() => resolveCurrentTurnPresentationState({
    phase,
    isSending,
    messages,
    dismissedResponseId,
    allowedTypes,
    transportConnected: loopTransportState.isPresentationTransportConnected,
  }), [
    allowedTypes,
    dismissedResponseId,
    isSending,
    loopTransportState.isPresentationTransportConnected,
    messages,
    phase,
  ]);

  return {
    ...presentationState,
    isTransportConnected: loopTransportState.isTransportConnected,
  };
}
