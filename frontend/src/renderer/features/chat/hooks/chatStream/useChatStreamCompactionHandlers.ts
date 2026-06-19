/**
 * Handles use chat stream compaction handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type {
  CompactedReplaySnapshot,
  ConversationEvent,
} from '../../../../app/runtime/desktopConversationRuntimeContracts';
import {
  buildCompactedReplaySnapshot,
  buildCompactionDebugInfo,
  hasCompactionReplacementHistoryEntries,
  resolveCompactionSkippedReason,
  resolveCompactionUserId,
} from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import {
  COMPACTION_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
} from '../../../../app/runtime/desktopChatStreamThinkingRuntime';
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
  debugInfo: ReturnType<typeof buildCompactionDebugInfo> | null,
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

async function persistCompactedReplaySnapshot(
  snapshot: CompactedReplaySnapshot,
  userId: string,
): Promise<void> {
  await DesktopConversationContinuityService.replaceCompactedReplay(snapshot, userId);
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
    const skippedReason = resolveCompactionSkippedReason(event.payload);
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
    setCompactionDebugInfoRef.current(
      buildCompactionDebugInfo(event.payload, skippedReason),
      conversationRef,
    );
    const snapshot = hasCompactionReplacementHistoryEntries(event.payload)
      ? buildCompactedReplaySnapshot(event, conversationRef)
      : null;
    if (snapshot) {
      void persistCompactedReplayRef.current(
        snapshot,
        resolveCompactionUserId(event.payload),
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
