/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage, SdkCurrentTurnProjection } from '../stores/chatStore';
import type {
  CurrentTurnToolEvent,
  SdkDisplayRow,
} from '../../../infrastructure/api/windieSdkClient';
import {
  buildChatMessagesFromSdkDisplayRows,
} from '../../../infrastructure/transcript/sdkDisplayChatMessageProjection';
import { buildThinkingStatus } from '../utils/chatStream/chatStreamFormatting';
import { GENERIC_THINKING_STATUS } from '../utils/chatStream/chatStreamThinkingStatus';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  shouldIgnoreConversationEventForStaleTurn,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import { logRendererLiveSurfaceTrace } from '../utils/chatStream/chatStreamDebugTrace';

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
  typingVisible: boolean | null;
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

function resolveSdkPresentationTypingVisible(currentTurn: SdkCurrentTurnProjection): boolean | null {
  const presentation = asRecord((currentTurn as { presentation?: unknown }).presentation);
  return typeof presentation?.typingVisible === 'boolean'
    ? presentation.typingVisible
    : null;
}

function resolveSdkPresentationHasVisibleContent(currentTurn: SdkCurrentTurnProjection): boolean {
  const presentation = asRecord((currentTurn as { presentation?: unknown }).presentation);
  if (typeof presentation?.hasVisibleContent === 'boolean') {
    return presentation.hasVisibleContent;
  }
  return presentation?.overlayVisible === true;
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
    if (!ON_CHANNELS.WINDIE_PENDING_TURN) {
      return undefined;
    }
    const removeListener = IpcBridge.on(ON_CHANNELS.WINDIE_PENDING_TURN, (payload: unknown) => {
      applyPendingTurnBroadcast(payload);
    });
    return () => {
      removeListener?.();
    };
  }, [applyPendingTurnBroadcast]);

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
        source: 'windie:current-turn',
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
      const previousCursor = projectionCursorsRef.current.get(cursorKey) ?? {
        assistantLength: 0,
        reasoningLength: 0,
        phase: null,
        typingVisible: null,
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
      const sdkTypingVisible = resolveSdkPresentationTypingVisible(currentTurn);
      const shouldShowTyping = sdkTypingVisible ?? (currentTurn.phase === 'awaiting');
      const hasSdkVisibleContent = resolveSdkPresentationHasVisibleContent(currentTurn);

      if (currentTurn.phase === 'awaiting' && previousCursor.phase !== 'awaiting') {
        setIsSending(shouldShowTyping, conversationRef);
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

      if (!shouldShowTyping && previousCursor.typingVisible === true) {
        setIsSending(false, conversationRef);
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

      if (hasSdkVisibleContent) {
        setIsSending(false, conversationRef);
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

      if (currentTurn.phase === 'complete') {
        setIsSending(false, conversationRef);
        setThinkingStatus(null, conversationRef);
        setThinkingSourceEventType(null, conversationRef);
        if (previousCursor.phase !== 'complete') {
          recordTrackingEventRuntime(
            updateStreamTracking,
            'streaming-complete',
            currentTurn.turnRef,
            { phase: 'complete' },
            conversationRef,
          );
        }
      } else if (currentTurn.phase === 'error') {
        const errorText = typeof currentTurn.lastError === 'string' && currentTurn.lastError.trim()
          ? currentTurn.lastError
          : 'Unknown runtime error';
        setIsSending(false, conversationRef);
        setThinkingStatus('', conversationRef);
        setThinkingSourceEventType(null, conversationRef);
        if (previousCursor.phase !== 'error' || previousCursor.lastError !== currentTurn.lastError) {
          recordTrackingEventRuntime(
            updateStreamTracking,
            'error',
            currentTurn.turnRef,
            { phase: 'error', errorText },
            conversationRef,
          );
        }
      }

      projectionCursorsRef.current.set(cursorKey, {
        assistantLength: assistantText.length,
        reasoningLength: reasoningText.length,
        phase: currentTurn.phase,
        typingVisible: shouldShowTyping,
        lastError: currentTurn.lastError ?? null,
        toolEventIds: nextToolEventIds,
      });
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
    if (!ON_CHANNELS.WINDIE_ROWS) {
      return undefined;
    }
    const removeListener = IpcBridge.on(ON_CHANNELS.WINDIE_ROWS, (payload: unknown) => {
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
