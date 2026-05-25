import { useEffect } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useChatStore } from '../stores/chatStore';
import type { SdkCurrentTurnProjection } from '../stores/chatStore';

function isCurrentTurnProjection(value: unknown): value is SdkCurrentTurnProjection {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const projection = value as Partial<SdkCurrentTurnProjection>;
  return typeof projection.conversationRef === 'string'
    && typeof projection.phase === 'string'
    && typeof projection.assistantText === 'string'
    && Array.isArray(projection.toolEvents);
}

export function useConversationRuntimeProjectionStream(): void {
  const setCurrentTurnProjection = useChatStore((state) => state.setCurrentTurnProjection);

  useEffect(() => {
    if (!ON_CHANNELS.CONVERSATION_RUNTIME_UPDATED) {
      return undefined;
    }
    const removeListener = IpcBridge.on(ON_CHANNELS.CONVERSATION_RUNTIME_UPDATED, (payload: unknown) => {
      const payloadRecord = payload && typeof payload === 'object'
        ? payload as Record<string, unknown>
        : {};
      const currentTurn = payloadRecord.currentTurn;
      if (!isCurrentTurnProjection(currentTurn)) {
        return;
      }
      const conversationRef = typeof payloadRecord.conversationRef === 'string'
        ? payloadRecord.conversationRef
        : currentTurn.conversationRef;
      setCurrentTurnProjection(currentTurn, conversationRef);
    });
    return () => {
      removeListener?.();
    };
  }, [setCurrentTurnProjection]);
}
