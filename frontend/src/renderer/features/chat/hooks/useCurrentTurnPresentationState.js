import { useMemo } from 'react';
import {
  findLatestVisibleAssistantReply,
  resolveCurrentTurnPresentationState,
} from '../utils/state/chatTurnPresentationState';
import { useOverlayTurnLifecycle } from './useOverlayTurnLifecycle';

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

  const overlayTurnLifecycleState = useOverlayTurnLifecycle({
    phase,
    isSending,
    hasVisibleReply,
  });

  const presentationState = useMemo(() => resolveCurrentTurnPresentationState({
    phase,
    lifecycle: overlayTurnLifecycleState.lifecycle,
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
    overlayTurnLifecycleState.lifecycle,
  ]);

  return {
    ...presentationState,
    isTransportConnected: overlayTurnLifecycleState.isTransportConnected,
    overlayTurnLifecycle: overlayTurnLifecycleState.lifecycle,
  };
}
