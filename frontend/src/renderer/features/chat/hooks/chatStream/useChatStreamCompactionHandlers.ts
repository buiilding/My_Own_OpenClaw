import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import type {
  BackendEvent,
  BackendEventType,
  ContextCompactionCompletedEvent,
  ContextCompactionFailedEvent,
  ContextCompactionStartedEvent,
} from '../../../../types/backendEvents';
import {
  COMPACTION_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
} from '../../utils/chatStream/chatStreamThinkingStatus';
import type { StreamTrackingOptions } from '../../utils/chatStream/chatStreamTracking';
import { DesktopConversationRuntimeClient } from '../../session/desktopConversationRuntimeClient';
import { useLatestRef } from '../../../../infrastructure/hooks/useLatestRef';

type ResolveTargetConversationRef = (event: BackendEvent) => string | null;

type ShouldIgnoreForStaleTurn = (
  event: BackendEvent,
  conversationRef?: string | null,
) => boolean;

type SetThinkingStatus = (
  status: string | null,
  conversationRef?: string | null,
) => void;

type SetThinkingSourceEventType = (
  sourceEventType: string | null,
  conversationRef?: string | null,
) => void;

type GetThinkingSourceEventType = (
  conversationRef?: string | null,
) => string | null;

type SetCompactionDebugInfo = (
  debugInfo: {
    reason: string | null;
    strategy: string | null;
    beforeTokens: number | null;
    afterTokens: number | null;
    removedMessages: number | null;
    summaryPreview: string | null;
    summaryText: string | null;
    replacementHistoryPreview: Array<{
      role: string | null;
      messageType: string | null;
      content: string | null;
      toolName: string | null;
      toolCallId: string | null;
    }>;
    skippedReason: string | null;
  } | null,
  conversationRef?: string | null,
) => void;

type RecordTrackingEvent = (
  eventType: BackendEventType,
  turnRef: string | null | undefined,
  options?: StreamTrackingOptions,
  conversationRef?: string | null,
) => void;

type PersistCompactedReplayFromBackendEvent = (
  event: ContextCompactionCompletedEvent,
  conversationRef: string,
  userId: string,
) => Promise<void>;

type CompactionStreamEvent =
  | ContextCompactionStartedEvent
  | ContextCompactionCompletedEvent
  | ContextCompactionFailedEvent
  | ConversationEvent;

function unwrapCompactionBackendEvent<
  TEvent extends ContextCompactionStartedEvent | ContextCompactionCompletedEvent | ContextCompactionFailedEvent,
>(
  event: CompactionStreamEvent,
  expectedType: TEvent['type'],
): TEvent | null {
  if ('turn_ref' in event && event.type === expectedType) {
    return event as TEvent;
  }
  const rawEvent = event.payload?.rawEvent;
  if (
    rawEvent
    && typeof rawEvent === 'object'
    && !Array.isArray(rawEvent)
    && (rawEvent as { type?: unknown }).type === expectedType
  ) {
    return rawEvent as TEvent;
  }
  return null;
}

function resolveCompactionConversationRef(
  event: CompactionStreamEvent,
  backendEvent: BackendEvent,
  resolveTargetConversationRef: ResolveTargetConversationRef,
): string | null {
  if ('conversationRef' in event && typeof event.conversationRef === 'string') {
    return event.conversationRef;
  }
  return resolveTargetConversationRef(backendEvent);
}

function hasReplacementHistoryEntries(
  event: ContextCompactionCompletedEvent,
): boolean {
  return Array.isArray(event.payload?.replacement_history_entries)
    && event.payload.replacement_history_entries.some(
      (entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    );
}

async function persistCompactedReplayFromBackendEvent(
  event: ContextCompactionCompletedEvent,
  conversationRef: string,
  userId: string,
): Promise<void> {
  await DesktopConversationRuntimeClient.replaceCompactedReplayFromBackendEvent({
    event,
    conversationRef,
    userId,
  });
}

export function useChatStreamCompactionHandlers({
  resolveTargetConversationRef,
  shouldIgnoreForStaleTurn,
  setThinkingStatus,
  setThinkingSourceEventType,
  getThinkingSourceEventType,
  setCompactionDebugInfo,
  recordTrackingEvent,
  persistCompactedReplay = persistCompactedReplayFromBackendEvent,
}: {
  resolveTargetConversationRef: ResolveTargetConversationRef;
  shouldIgnoreForStaleTurn: ShouldIgnoreForStaleTurn;
  setThinkingStatus: SetThinkingStatus;
  setThinkingSourceEventType: SetThinkingSourceEventType;
  getThinkingSourceEventType?: GetThinkingSourceEventType;
  setCompactionDebugInfo: SetCompactionDebugInfo;
  recordTrackingEvent: RecordTrackingEvent;
  persistCompactedReplay?: PersistCompactedReplayFromBackendEvent;
}) {
  const resolveTargetConversationRefRef = useLatestRef(resolveTargetConversationRef);
  const shouldIgnoreForStaleTurnRef = useLatestRef(shouldIgnoreForStaleTurn);
  const setThinkingStatusRef = useLatestRef(setThinkingStatus);
  const setThinkingSourceEventTypeRef = useLatestRef(setThinkingSourceEventType);
  const getThinkingSourceEventTypeRef = useLatestRef(getThinkingSourceEventType);
  const setCompactionDebugInfoRef = useLatestRef(setCompactionDebugInfo);
  const recordTrackingEventRef = useLatestRef(recordTrackingEvent);
  const persistCompactedReplayRef = useLatestRef(persistCompactedReplay);

  const handleContextCompactionStarted = useCallback((event: ContextCompactionStartedEvent | ConversationEvent) => {
    const backendEvent = unwrapCompactionBackendEvent<ContextCompactionStartedEvent>(
      event,
      'context-compaction-started',
    );
    if (!backendEvent) {
      return;
    }
    const conversationRef = resolveCompactionConversationRef(event, backendEvent, resolveTargetConversationRefRef.current);
    if (shouldIgnoreForStaleTurnRef.current(backendEvent, conversationRef)) {
      return;
    }
    setThinkingStatusRef.current(COMPACTION_THINKING_STATUS, conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-started', conversationRef);
    setCompactionDebugInfoRef.current(null, conversationRef);
    recordTrackingEventRef.current('context-compaction-started', backendEvent.turn_ref, {}, conversationRef);
  }, [
    recordTrackingEventRef,
    resolveTargetConversationRefRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
    shouldIgnoreForStaleTurnRef,
  ]);

  const handleContextCompactionCompleted = useCallback((event: ContextCompactionCompletedEvent | ConversationEvent) => {
    const backendEvent = unwrapCompactionBackendEvent<ContextCompactionCompletedEvent>(
      event,
      'context-compaction-completed',
    );
    if (!backendEvent) {
      return;
    }
    const conversationRef = resolveCompactionConversationRef(event, backendEvent, resolveTargetConversationRefRef.current);
    if (shouldIgnoreForStaleTurnRef.current(backendEvent, conversationRef)) {
      return;
    }
    const skippedReason = (
      typeof backendEvent.payload?.skipped_reason === 'string'
        ? backendEvent.payload.skipped_reason.trim()
        : ''
    );
    if (skippedReason) {
      const currentSourceEventType = getThinkingSourceEventTypeRef.current?.(conversationRef) ?? null;
      if (
        currentSourceEventType === 'context-compaction-started'
        || currentSourceEventType === 'context-compaction-completed'
        || currentSourceEventType === 'context-compaction-failed'
      ) {
        setThinkingStatusRef.current(null, conversationRef);
        setThinkingSourceEventTypeRef.current(null, conversationRef);
      }
      setCompactionDebugInfoRef.current(null, conversationRef);
      recordTrackingEventRef.current('context-compaction-completed', backendEvent.turn_ref, {}, conversationRef);
      return;
    }
    setThinkingStatusRef.current(
      COMPACTION_COMPLETED_THINKING_STATUS,
      conversationRef,
    );
    setThinkingSourceEventTypeRef.current('context-compaction-completed', conversationRef);
    setCompactionDebugInfoRef.current({
      reason: typeof backendEvent.payload?.reason === 'string' ? backendEvent.payload.reason : null,
      strategy: typeof backendEvent.payload?.strategy === 'string' ? backendEvent.payload.strategy : null,
      beforeTokens: typeof backendEvent.payload?.before_tokens === 'number' ? backendEvent.payload.before_tokens : null,
      afterTokens: typeof backendEvent.payload?.after_tokens === 'number' ? backendEvent.payload.after_tokens : null,
      removedMessages: typeof backendEvent.payload?.removed_messages === 'number' ? backendEvent.payload.removed_messages : null,
      summaryPreview: typeof backendEvent.payload?.summary_preview === 'string' ? backendEvent.payload.summary_preview : null,
      summaryText: typeof backendEvent.payload?.summary_text === 'string' ? backendEvent.payload.summary_text : null,
      replacementHistoryPreview: Array.isArray(backendEvent.payload?.replacement_history_preview)
        ? backendEvent.payload.replacement_history_preview.map((entry) => ({
          role: typeof entry?.role === 'string' ? entry.role : null,
          messageType: typeof entry?.message_type === 'string' ? entry.message_type : null,
          content: typeof entry?.content === 'string' ? entry.content : null,
          toolName: typeof entry?.tool_name === 'string' ? entry.tool_name : null,
          toolCallId: typeof entry?.tool_call_id === 'string' ? entry.tool_call_id : null,
        }))
        : [],
      skippedReason: skippedReason || null,
    }, conversationRef);
    if (!skippedReason && conversationRef && hasReplacementHistoryEntries(backendEvent)) {
      void persistCompactedReplayRef.current(
        backendEvent,
        conversationRef,
        backendEvent.user_id || 'default_user',
      ).catch((error) => {
        console.warn('[useChatStreamCompactionHandlers] Failed to persist compacted replay state:', error);
      });
    }
    recordTrackingEventRef.current('context-compaction-completed', backendEvent.turn_ref, {}, conversationRef);
  }, [
    getThinkingSourceEventTypeRef,
    persistCompactedReplayRef,
    recordTrackingEventRef,
    resolveTargetConversationRefRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
    shouldIgnoreForStaleTurnRef,
  ]);

  const handleContextCompactionFailed = useCallback((event: ContextCompactionFailedEvent | ConversationEvent) => {
    const backendEvent = unwrapCompactionBackendEvent<ContextCompactionFailedEvent>(
      event,
      'context-compaction-failed',
    );
    if (!backendEvent) {
      return;
    }
    const conversationRef = resolveCompactionConversationRef(event, backendEvent, resolveTargetConversationRefRef.current);
    if (shouldIgnoreForStaleTurnRef.current(backendEvent, conversationRef)) {
      return;
    }
    const errorText = (
      typeof backendEvent.payload?.error === 'string'
        ? backendEvent.payload.error.trim()
        : ''
    );
    setThinkingStatusRef.current(errorText || COMPACTION_FAILED_THINKING_STATUS, conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-failed', conversationRef);
    setCompactionDebugInfoRef.current(null, conversationRef);
    recordTrackingEventRef.current('context-compaction-failed', backendEvent.turn_ref, {}, conversationRef);
  }, [
    recordTrackingEventRef,
    resolveTargetConversationRefRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
    shouldIgnoreForStaleTurnRef,
  ]);

  return {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  };
}
