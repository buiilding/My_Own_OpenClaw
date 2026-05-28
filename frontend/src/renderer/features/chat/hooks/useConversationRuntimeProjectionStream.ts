import { useEffect, useRef } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useChatStore } from '../stores/chatStore';
import type { SdkCurrentTurnProjection } from '../stores/chatStore';
import type { CurrentTurnToolEvent } from '../../../infrastructure/api/windieSdkClient';
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
  phase: string | null;
  lastError: string | null;
  toolEventIds: Set<string>;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isSkipFrontendExecutionToolEvent(toolEvent: CurrentTurnToolEvent): boolean {
  const payload = asRecord(toolEvent.payload);
  const structuredPayload = asRecord(payload?.structuredPayload);
  const metadata = asRecord(structuredPayload?.metadata) ?? asRecord(payload?.metadata);
  return metadata?.skip_frontend_execution === true;
}

function shouldAcceptCurrentTurnBeforeLocalSend(currentTurn: SdkCurrentTurnProjection): boolean {
  return currentTurn.phase === 'awaiting';
}

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map<string, ProjectionCursor>());
  const setCurrentTurnProjection = useChatStore((state) => state.setCurrentTurnProjection);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);

  useEffect(() => {
    if (!ON_CHANNELS.WINDIE_CURRENT_TURN) {
      return undefined;
    }
    const removeListener = IpcBridge.on(ON_CHANNELS.WINDIE_CURRENT_TURN, (payload: unknown) => {
      const payloadRecord = payload && typeof payload === 'object'
        ? payload as Record<string, unknown>
        : {};
      const currentTurn = isCurrentTurnProjection(payload)
        ? payload
        : payloadRecord.currentTurn;
      if (!isCurrentTurnProjection(currentTurn)) {
        return;
      }
      const conversationRef = typeof payloadRecord.conversationRef === 'string'
        ? payloadRecord.conversationRef
        : currentTurn.conversationRef;

      if (
        !shouldAcceptCurrentTurnBeforeLocalSend(currentTurn)
        && shouldIgnoreConversationEventForStaleTurn({
          turnRef: currentTurn.turnRef,
        }, conversationRef, {
          getWorkspaceState: useChatStore.getState().getWorkspaceState,
        })
      ) {
        return;
      }

      setCurrentTurnProjection(currentTurn, conversationRef);

      const cursorKey = buildProjectionCursorKey(conversationRef, currentTurn.turnRef ?? null);
      const previousCursor = projectionCursorsRef.current.get(cursorKey) ?? {
        assistantLength: 0,
        reasoningLength: 0,
        phase: null,
        lastError: null,
        toolEventIds: new Set<string>(),
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

      if (currentTurn.phase === 'awaiting' && previousCursor.phase !== 'awaiting') {
        setIsSending(true, conversationRef);
        setThinkingStatus(null, conversationRef);
        setThinkingSourceEventType(null, conversationRef);
        recordTrackingEventRuntime(
          updateStreamTracking,
          'query-accepted',
          currentTurn.turnRef,
          {
            phase: 'awaiting-first-chunk',
            resetForTurn: true,
          },
          conversationRef,
        );
      }

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

      const nextToolEventIds = new Set(previousCursor.toolEventIds);
      for (const toolEvent of currentTurn.toolEvents) {
        if (nextToolEventIds.has(toolEvent.id)) {
          continue;
        }
        nextToolEventIds.add(toolEvent.id);
        if (toolEvent.kind === 'tool_call') {
          if (!isSkipFrontendExecutionToolEvent(toolEvent)) {
            setIsSending(false, conversationRef);
            setThinkingStatus(null, conversationRef);
            setThinkingSourceEventType(null, conversationRef);
          }
          recordTrackingEventRuntime(
            updateStreamTracking,
            'tool-call',
            currentTurn.turnRef,
            { phase: 'tool-call', toolCall: true },
            conversationRef,
          );
        } else if (toolEvent.kind === 'tool_output') {
          setIsSending(false, conversationRef);
          setThinkingStatus(null, conversationRef);
          setThinkingSourceEventType(null, conversationRef);
          recordTrackingEventRuntime(
            updateStreamTracking,
            'tool-output',
            currentTurn.turnRef,
            { phase: 'tool-output', toolOutput: true },
            conversationRef,
          );
        } else if (toolEvent.kind === 'tool_progress') {
          recordTrackingEventRuntime(
            updateStreamTracking,
            'web-search-progress',
            currentTurn.turnRef,
            { phase: 'tool-call', toolCall: true },
            conversationRef,
          );
        }
      }

      if (currentTurn.phase === 'complete' && previousCursor.phase !== 'complete') {
        setIsSending(false, conversationRef);
        setThinkingStatus(null, conversationRef);
        setThinkingSourceEventType(null, conversationRef);
        recordTrackingEventRuntime(
          updateStreamTracking,
          'streaming-complete',
          currentTurn.turnRef,
          { phase: 'complete' },
          conversationRef,
        );
      } else if (
        currentTurn.phase === 'error'
        && (previousCursor.phase !== 'error' || previousCursor.lastError !== currentTurn.lastError)
      ) {
        const errorText = typeof currentTurn.lastError === 'string' && currentTurn.lastError.trim()
          ? currentTurn.lastError
          : 'Unknown runtime error';
        setIsSending(false, conversationRef);
        setThinkingStatus('', conversationRef);
        setThinkingSourceEventType(null, conversationRef);
        recordTrackingEventRuntime(
          updateStreamTracking,
          'error',
          currentTurn.turnRef,
          { phase: 'error', errorText },
          conversationRef,
        );
      }

      projectionCursorsRef.current.set(cursorKey, {
        assistantLength: assistantText.length,
        reasoningLength: reasoningText.length,
        phase: currentTurn.phase,
        lastError: currentTurn.lastError ?? null,
        toolEventIds: nextToolEventIds,
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
