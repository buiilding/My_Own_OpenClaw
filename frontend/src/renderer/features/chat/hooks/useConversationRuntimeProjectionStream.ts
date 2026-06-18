/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage, SdkCurrentTurnProjection } from '../stores/chatStore';
import type {
  SdkDisplayRow,
} from '../../../infrastructure/api/agentSdkClient';
import {
  buildChatMessagesFromSdkDisplayRows,
} from '../../../infrastructure/transcript/sdkDisplayChatMessageProjection';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  shouldIgnoreConversationEventForStaleTurn,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import { DesktopConversationRuntimeEventClient } from '../../../app/runtime/desktopConversationRuntimeEventClient';
import { logRendererLiveSurfaceTrace } from '../utils/chatStream/chatStreamDebugTrace';
import { SDK_CURRENT_TURN_SOURCE_CHANNEL } from '../utils/message/sourceChannels';
import {
  applyCurrentTurnProjectionSideEffects,
  buildProjectionCursorKey,
  createProjectionCursor,
  shouldAcceptCurrentTurnBeforeLocalSend,
  type ProjectionCursor,
} from '../utils/state/currentTurnProjectionSideEffects';

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

function isSdkDisplayRow(value: unknown): value is SdkDisplayRow {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Partial<SdkDisplayRow>;
  return typeof row.id === 'string'
    && typeof row.conversationRef === 'string'
    && typeof row.type === 'string'
    && typeof row.role === 'string';
}

function isSdkDisplayRows(value: unknown): value is SdkDisplayRow[] {
  return Array.isArray(value) && value.every(isSdkDisplayRow);
}

function resolveRowsConversationRef(rows: SdkDisplayRow[]): string | null {
  for (const row of rows) {
    if (typeof row.conversationRef === 'string' && row.conversationRef.trim()) {
      return row.conversationRef;
    }
  }
  return null;
}

function normalizeTurnRef(turnRef: string | null | undefined): string | null {
  return typeof turnRef === 'string' && turnRef.trim()
    ? turnRef.trim()
    : null;
}

function isOptimisticUserMessage(message: ChatMessage): boolean {
  return message.sender === 'user'
    && normalizeTurnRef(message.turnRef) !== null
    && message.sourceEventType === 'renderer-compose'
    && message.sourceChannel === 'renderer-local';
}

function sdkUserTurnRefs(messages: ChatMessage[]): Set<string> {
  const turnRefs = new Set<string>();
  for (const message of messages) {
    if (message.sender !== 'user') {
      continue;
    }
    const turnRef = normalizeTurnRef(message.turnRef);
    if (turnRef) {
      turnRefs.add(turnRef);
    }
  }
  return turnRefs;
}

function pendingOptimisticUserMessages(
  sdkMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  const sdkMessageIds = new Set(sdkMessages.map((message) => message.id));
  const projectedUserTurns = sdkUserTurnRefs(sdkMessages);
  return currentMessages.filter((message) => {
    const turnRef = normalizeTurnRef(message.turnRef);
    return isOptimisticUserMessage(message)
      && turnRef !== null
      && !sdkMessageIds.has(message.id)
      && !projectedUserTurns.has(turnRef);
  });
}

function mergePendingOptimisticUserMessages(
  sdkMessages: ChatMessage[],
  optimisticMessages: ChatMessage[],
): ChatMessage[] {
  if (optimisticMessages.length === 0) {
    return sdkMessages;
  }
  const merged = [...sdkMessages];
  for (const optimisticMessage of optimisticMessages) {
    const turnRef = normalizeTurnRef(optimisticMessage.turnRef);
    const sameTurnIndex = turnRef
      ? merged.findIndex((message) => normalizeTurnRef(message.turnRef) === turnRef)
      : -1;
    if (sameTurnIndex >= 0) {
      merged.splice(sameTurnIndex, 0, optimisticMessage);
    } else {
      merged.push(optimisticMessage);
    }
  }
  return merged;
}

function mergeRendererAnnotations(
  sdkMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  if (currentMessages.length === 0) {
    return sdkMessages;
  }
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const mergedSdkMessages = sdkMessages.map((message) => {
    const current = currentById.get(message.id);
    if (!current) {
      return message;
    }
    return {
      ...message,
      ...(current.systemPrompt ? { systemPrompt: current.systemPrompt } : {}),
      ...(current.toolSchemas ? { toolSchemas: current.toolSchemas } : {}),
      ...(current.fullUserMessage ? { fullUserMessage: current.fullUserMessage } : {}),
      ...(current.fullAssistantMessage ? { fullAssistantMessage: current.fullAssistantMessage } : {}),
      ...(current.feedback ? { feedback: current.feedback } : {}),
      ...(current.tokenCounts ? { tokenCounts: current.tokenCounts } : {}),
    };
  });
  return mergePendingOptimisticUserMessages(
    mergedSdkMessages,
    pendingOptimisticUserMessages(mergedSdkMessages, currentMessages),
  );
}

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map<string, ProjectionCursor>());
  const setMessages = useChatStore((state) => state.setMessages);
  const setCurrentTurnProjection = useChatStore((state) => state.setCurrentTurnProjection);
  const setLatestCurrentTurnProjection = useChatStore((state) => state.setLatestCurrentTurnProjection);
  const applyPendingTurnBroadcast = useChatStore((state) => state.applyPendingTurnBroadcast);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onPendingTurn((payload: unknown) => {
      applyPendingTurnBroadcast(payload);
    });
    return () => {
      removeListener?.();
    };
  }, [applyPendingTurnBroadcast]);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onCurrentTurn((payload: unknown) => {
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

      setLatestCurrentTurnProjection(currentTurn);
      setCurrentTurnProjection(currentTurn, conversationRef);

      const shouldSkipDerivedSideEffects = (
        !shouldAcceptCurrentTurnBeforeLocalSend(currentTurn)
        && shouldIgnoreConversationEventForStaleTurn({
          turnRef: currentTurn.turnRef,
        }, conversationRef, {
          getWorkspaceState: useChatStore.getState().getWorkspaceState,
        })
      );
      logRendererLiveSurfaceTrace('renderer.current_turn.applied', {
        source: SDK_CURRENT_TURN_SOURCE_CHANNEL,
        turnRef: currentTurn.turnRef ?? null,
        conversationRef,
        phase: currentTurn.phase,
        overlayMode: currentTurn.presentation?.overlayIntent?.mode ?? null,
        guardRef: currentTurn.presentation?.overlayIntent?.staleGuardRef
          ?? currentTurn.presentation?.overlayIntent?.turnRef
          ?? currentTurn.turnRef
          ?? null,
        typingVisible: currentTurn.presentation?.typingVisible === true,
        overlayVisible: currentTurn.presentation?.overlayVisible === true,
        hasVisibleContent: currentTurn.presentation?.hasVisibleContent === true,
        entryCount: Array.isArray(currentTurn.presentation?.entries)
          ? currentTurn.presentation.entries.length
          : 0,
        assistantLength: typeof currentTurn.assistantText === 'string'
          ? currentTurn.assistantText.length
          : 0,
        reasoningLength: typeof currentTurn.reasoningText === 'string'
          ? currentTurn.reasoningText.length
          : 0,
        toolEventCount: Array.isArray(currentTurn.toolEvents) ? currentTurn.toolEvents.length : 0,
        staleSideEffectsSkipped: shouldSkipDerivedSideEffects,
      }, conversationRef);
      if (shouldSkipDerivedSideEffects) {
        return;
      }

      const cursorKey = buildProjectionCursorKey(conversationRef, currentTurn.turnRef ?? null);
      const previousCursor = projectionCursorsRef.current.get(cursorKey) ?? createProjectionCursor();
      projectionCursorsRef.current.set(cursorKey, applyCurrentTurnProjectionSideEffects({
        conversationRef,
        currentTurn,
        cursor: previousCursor,
        deps: {
          getWorkspaceState: useChatStore.getState().getWorkspaceState,
          setIsSending,
          setThinkingStatus,
          setThinkingSourceEventType,
          updateStreamTracking,
          recordTrackingEvent: recordTrackingEventRuntime,
        },
      }));
    });
    return () => {
      removeListener?.();
    };
  }, [
    setCurrentTurnProjection,
    setLatestCurrentTurnProjection,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateStreamTracking,
  ]);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onDisplayRows((payload: unknown) => {
      if (!isSdkDisplayRows(payload)) {
        return;
      }
      const conversationRef = resolveRowsConversationRef(payload);
      if (!conversationRef) {
        return;
      }
      const sdkMessages = buildChatMessagesFromSdkDisplayRows(payload);
      const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
      setMessages(
        mergeRendererAnnotations(sdkMessages, workspace.messages),
        conversationRef,
      );
    });
    return () => {
      removeListener?.();
    };
  }, [setMessages]);
}
