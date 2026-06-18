/**
 * Handles use chat stream compaction handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type {
  CompactedReplaySnapshot,
  ConversationEvent,
  JsonRecord,
} from '../../../../app/runtime/desktopConversationRuntimeContracts';
import {
  COMPACTION_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
} from '../../utils/chatStream/chatStreamThinkingStatus';
import type {
  StreamTrackingEventType,
  StreamTrackingOptions,
} from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import { DesktopConversationContinuityService } from '../../../../app/runtime/desktopConversationContinuityService';
import { useLatestRef } from '../../../../app/runtime/desktopRendererHooksRuntimeClient';

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
  eventType: StreamTrackingEventType,
  turnRef: string | null | undefined,
  options?: StreamTrackingOptions,
  conversationRef?: string | null,
) => void;

type PersistCompactedReplaySnapshot = (
  snapshot: CompactedReplaySnapshot,
  userId: string,
) => Promise<void>;

type CompactionEventType =
  | 'compaction_started'
  | 'compaction_applied'
  | 'compaction_skipped'
  | 'compaction_failed';

type CompactionConversationEvent = ConversationEvent & {
  type: CompactionEventType;
};

function isCompactionEvent(
  event: ConversationEvent,
  expectedType: CompactionEventType,
): event is CompactionConversationEvent {
  return event.type === expectedType;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordOrNull(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function replacementHistoryEntriesFromEvent(event: CompactionConversationEvent): JsonRecord[] {
  return arrayOrEmpty(
    event.payload.entries ?? event.payload.replacementHistoryEntries ?? event.payload.replacement_history_entries,
  ).map(recordOrNull).filter((entry): entry is JsonRecord => Boolean(entry));
}

function hasReplacementHistoryEntries(event: CompactionConversationEvent): boolean {
  return replacementHistoryEntriesFromEvent(event).length > 0;
}

function buildCompactedReplaySnapshot(
  event: CompactionConversationEvent,
  conversationRef: string,
): CompactedReplaySnapshot | null {
  const entries = replacementHistoryEntriesFromEvent(event);
  if (entries.length === 0) {
    return null;
  }
  const stableSuffix = optionalString(event.eventId)
    ?? optionalString(event.turnRef)
    ?? `${Date.now()}`;
  return {
    generationId: optionalString(event.payload.generationId) ?? `compaction-${conversationRef}-${stableSuffix}`,
    conversationRef,
    sourceRevisionId: optionalString(event.revisionId) ?? `rev-compaction-${conversationRef}-${stableSuffix}`,
    sourceTurnRef: optionalString(event.turnRef),
    createdAt: event.timestamp,
    entries,
    entryCount: entries.length,
    complete: true,
    active: true,
  };
}

async function persistCompactedReplaySnapshot(
  snapshot: CompactedReplaySnapshot,
  userId: string,
): Promise<void> {
  await DesktopConversationContinuityService.replaceCompactedReplay(snapshot, userId);
}

function skippedReasonFromEvent(event: CompactionConversationEvent): string {
  return optionalString(event.payload.skippedReason)
    ?? optionalString(event.payload.skipped_reason)
    ?? '';
}

export function useChatStreamCompactionHandlers({
  setThinkingStatus,
  setThinkingSourceEventType,
  getThinkingSourceEventType,
  setCompactionDebugInfo,
  recordTrackingEvent,
  persistCompactedReplay = persistCompactedReplaySnapshot,
}: {
  setThinkingStatus: SetThinkingStatus;
  setThinkingSourceEventType: SetThinkingSourceEventType;
  getThinkingSourceEventType?: GetThinkingSourceEventType;
  setCompactionDebugInfo: SetCompactionDebugInfo;
  recordTrackingEvent: RecordTrackingEvent;
  persistCompactedReplay?: PersistCompactedReplaySnapshot;
}) {
  const setThinkingStatusRef = useLatestRef(setThinkingStatus);
  const setThinkingSourceEventTypeRef = useLatestRef(setThinkingSourceEventType);
  const getThinkingSourceEventTypeRef = useLatestRef(getThinkingSourceEventType);
  const setCompactionDebugInfoRef = useLatestRef(setCompactionDebugInfo);
  const recordTrackingEventRef = useLatestRef(recordTrackingEvent);
  const persistCompactedReplayRef = useLatestRef(persistCompactedReplay);

  const handleContextCompactionStarted = useCallback((event: ConversationEvent) => {
    if (!isCompactionEvent(event, 'compaction_started')) {
      return;
    }
    const conversationRef = event.conversationRef;
    setThinkingStatusRef.current(COMPACTION_THINKING_STATUS, conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-started', conversationRef);
    setCompactionDebugInfoRef.current(null, conversationRef);
    recordTrackingEventRef.current('context-compaction-started', event.turnRef, {}, conversationRef);
  }, [
    recordTrackingEventRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
  ]);

  const handleContextCompactionCompleted = useCallback((event: ConversationEvent) => {
    if (!isCompactionEvent(event, 'compaction_applied') && !isCompactionEvent(event, 'compaction_skipped')) {
      return;
    }
    const conversationRef = event.conversationRef;
    const skippedReason = skippedReasonFromEvent(event);
    if (event.type === 'compaction_skipped' || skippedReason) {
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
      recordTrackingEventRef.current('context-compaction-completed', event.turnRef, {}, conversationRef);
      return;
    }
    setThinkingStatusRef.current(
      COMPACTION_COMPLETED_THINKING_STATUS,
      conversationRef,
    );
    setThinkingSourceEventTypeRef.current('context-compaction-completed', conversationRef);
    setCompactionDebugInfoRef.current({
      reason: stringOrNull(event.payload.reason),
      strategy: stringOrNull(event.payload.strategy),
      beforeTokens: numberOrNull(event.payload.beforeTokens ?? event.payload.before_tokens),
      afterTokens: numberOrNull(event.payload.afterTokens ?? event.payload.after_tokens),
      removedMessages: numberOrNull(event.payload.removedMessages ?? event.payload.removed_messages),
      summaryPreview: stringOrNull(event.payload.summaryPreview ?? event.payload.summary_preview),
      summaryText: stringOrNull(event.payload.summaryText ?? event.payload.summary_text),
      replacementHistoryPreview: arrayOrEmpty(
        event.payload.replacementHistoryPreview ?? event.payload.replacement_history_preview,
      ).map(recordOrNull).filter((entry): entry is JsonRecord => Boolean(entry)).map((entry) => ({
        role: typeof entry.role === 'string' ? entry.role : null,
        messageType: typeof entry.message_type === 'string' ? entry.message_type : null,
        content: typeof entry.content === 'string' ? entry.content : null,
        toolName: typeof entry.tool_name === 'string' ? entry.tool_name : null,
        toolCallId: typeof entry.tool_call_id === 'string' ? entry.tool_call_id : null,
      })),
      skippedReason: skippedReason || null,
    }, conversationRef);
    const snapshot = hasReplacementHistoryEntries(event)
      ? buildCompactedReplaySnapshot(event, conversationRef)
      : null;
    if (snapshot) {
      void persistCompactedReplayRef.current(
        snapshot,
        optionalString(event.payload.userId) || 'default_user',
      ).catch((error) => {
        console.warn('[useChatStreamCompactionHandlers] Failed to persist compacted replay state:', error);
      });
    }
    recordTrackingEventRef.current('context-compaction-completed', event.turnRef, {}, conversationRef);
  }, [
    getThinkingSourceEventTypeRef,
    persistCompactedReplayRef,
    recordTrackingEventRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
  ]);

  const handleContextCompactionFailed = useCallback((event: ConversationEvent) => {
    if (!isCompactionEvent(event, 'compaction_failed')) {
      return;
    }
    const conversationRef = event.conversationRef;
    const errorText = optionalString(event.payload.error) ?? '';
    setThinkingStatusRef.current(errorText || COMPACTION_FAILED_THINKING_STATUS, conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-failed', conversationRef);
    setCompactionDebugInfoRef.current(null, conversationRef);
    recordTrackingEventRef.current('context-compaction-failed', event.turnRef, {}, conversationRef);
  }, [
    recordTrackingEventRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
  ]);

  return {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  };
}
