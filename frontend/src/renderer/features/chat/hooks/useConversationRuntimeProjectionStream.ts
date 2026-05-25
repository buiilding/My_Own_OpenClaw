import { useEffect, useRef } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useChatStore } from '../stores/chatStore';
import type { SdkCurrentTurnProjection } from '../stores/chatStore';
import { buildThinkingStatus } from '../utils/chatStream/chatStreamFormatting';
import { GENERIC_THINKING_STATUS } from '../utils/chatStream/chatStreamThinkingStatus';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  shouldIgnoreConversationEventForStaleTurn,
} from '../../../app/runtime/desktopChatStreamEventRuntime';

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

type ProjectionCursor = {
  assistantLength: number;
  reasoningLength: number;
};

function buildProjectionCursorKey(
  conversationRef: string,
  turnRef: string | null,
): string {
  return `${conversationRef}:${turnRef ?? '__no_turn__'}`;
}

function getProjectionTextDelta(
  text: string | null | undefined,
  previousLength: number,
): string {
  if (typeof text !== 'string' || text.length <= previousLength) {
    return '';
  }
  return text.slice(previousLength);
}

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map<string, ProjectionCursor>());
  const setCurrentTurnProjection = useChatStore((state) => state.setCurrentTurnProjection);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);

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

      if (shouldIgnoreConversationEventForStaleTurn({
        turnRef: currentTurn.turnRef,
      }, conversationRef, {
        getWorkspaceState: useChatStore.getState().getWorkspaceState,
      })) {
        return;
      }

      setCurrentTurnProjection(currentTurn, conversationRef);

      const cursorKey = buildProjectionCursorKey(conversationRef, currentTurn.turnRef ?? null);
      const previousCursor = projectionCursorsRef.current.get(cursorKey) ?? {
        assistantLength: 0,
        reasoningLength: 0,
      };
      const assistantText = typeof currentTurn.assistantText === 'string'
        ? currentTurn.assistantText
        : '';
      const reasoningText = typeof currentTurn.reasoningText === 'string'
        ? currentTurn.reasoningText
        : '';
      const assistantDelta = getProjectionTextDelta(
        assistantText,
        previousCursor.assistantLength,
      );
      const reasoningDelta = getProjectionTextDelta(
        reasoningText,
        previousCursor.reasoningLength,
      );

      if (reasoningDelta) {
        const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
        const nextBaseStatus = workspace.thinkingStatus === GENERIC_THINKING_STATUS
          ? null
          : workspace.thinkingStatus;
        setThinkingStatus(buildThinkingStatus(nextBaseStatus, reasoningDelta), conversationRef);
        setThinkingSourceEventType('llm-thought', conversationRef);
        recordTrackingEventRuntime(
          updateStreamTracking,
          'llm-thought',
          currentTurn.turnRef,
          {},
          conversationRef,
        );
      }

      if (assistantDelta) {
        setIsSending(false, conversationRef);
        recordTrackingEventRuntime(
          updateStreamTracking,
          'streaming-response',
          currentTurn.turnRef,
          {
            phase: 'streaming',
            chunkSize: assistantDelta.length,
          },
          conversationRef,
        );
      }

      projectionCursorsRef.current.set(cursorKey, {
        assistantLength: assistantText.length,
        reasoningLength: reasoningText.length,
      });
    });
    return () => {
      removeListener?.();
    };
  }, [
    setCurrentTurnProjection,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateStreamTracking,
  ]);
}
