import { useCallback } from 'react';
import type { BackendEvent } from '../../../../types/backendEvents';
import { useLatestRef } from '../../../../infrastructure/hooks/useLatestRef';

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
  const resolveTargetConversationRefRef = useLatestRef(resolveTargetConversationRef);
  const shouldIgnoreForStaleTurnRef = useLatestRef(shouldIgnoreForStaleTurn);
  const onEventRef = useLatestRef(onEvent);

  return useCallback((event: TEvent) => {
    const conversationRef = resolveTargetConversationRefRef.current(event);
    if (!skipStaleTurnGate && shouldIgnoreForStaleTurnRef.current(event, conversationRef)) {
      return;
    }
    onEventRef.current(event, conversationRef);
  }, [
    onEventRef,
    resolveTargetConversationRefRef,
    shouldIgnoreForStaleTurnRef,
    skipStaleTurnGate,
  ]);
};
