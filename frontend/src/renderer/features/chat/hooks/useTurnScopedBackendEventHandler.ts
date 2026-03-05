import { useCallback } from 'react';
import type { BackendEvent } from '../../../types/backendEvents';

type UseTurnScopedBackendEventHandlerOptions<TEvent extends BackendEvent> = {
  resolveTargetConversationRef: (event: TEvent) => string | null;
  shouldIgnoreForStaleTurn: (event: TEvent, conversationRef?: string | null) => boolean;
  onEvent: (event: TEvent, conversationRef: string | null) => void;
  skipStaleTurnGate?: boolean;
};

export const useTurnScopedBackendEventHandler = <TEvent extends BackendEvent>({
  resolveTargetConversationRef,
  shouldIgnoreForStaleTurn,
  onEvent,
  skipStaleTurnGate = false,
}: UseTurnScopedBackendEventHandlerOptions<TEvent>) => {
  return useCallback((event: TEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (!skipStaleTurnGate && shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    onEvent(event, conversationRef);
  }, [onEvent, resolveTargetConversationRef, shouldIgnoreForStaleTurn, skipStaleTurnGate]);
};
