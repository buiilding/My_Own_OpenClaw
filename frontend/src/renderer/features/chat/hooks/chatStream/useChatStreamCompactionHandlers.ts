/**
 * Handles use chat stream compaction handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type {
  CompactedReplaySnapshot,
  ConversationEvent,
} from '../../../../app/runtime/desktopConversationRuntimeContracts';
import {
  isCompactionCompletedConversationStreamEvent,
  isCompactionFailedConversationStreamEvent,
  isCompactionSkippedConversationStreamEvent,
  isCompactionStartedConversationStreamEvent,
  resolveConversationStreamEventConversationRef,
  resolveConversationStreamEventTurnRef,
} from '../../../../app/runtime/desktopChatStreamEventRuntime';
import {
  buildCompactedReplaySnapshot,
  buildCompactionDebugInfo,
  hasCompactionReplacementHistoryEntries,
  resolveConversationStreamEventPayload,
  resolveCompactionErrorText,
  resolveCompactionSkippedReason,
  resolveCompactionUserId,
} from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import {
  getCompactionCompletedThinkingStatus,
  getCompactionStartedThinkingStatus,
  resolveCompactionFailedThinkingStatus,
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
    if (!isCompactionStartedConversationStreamEvent(event)) {
      return;
    }
    const conversationRef = resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    setThinkingStatusRef.current(getCompactionStartedThinkingStatus(), conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-started', conversationRef);
    setCompactionDebugInfoRef.current(null, conversationRef);
    recordTrackingEventRef.current('context-compaction-started', turnRef, {}, conversationRef);
  }, [
    recordTrackingEventRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
  ]);

  const handleContextCompactionCompleted = useCallback((event: ConversationEvent) => {
    if (!isCompactionCompletedConversationStreamEvent(event)) {
      return;
    }
    const conversationRef = resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    const payload = resolveConversationStreamEventPayload(event);
    const skippedReason = resolveCompactionSkippedReason(payload);
    if (isCompactionSkippedConversationStreamEvent(event) || skippedReason) {
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
      recordTrackingEventRef.current('context-compaction-completed', turnRef, {}, conversationRef);
      return;
    }
    setThinkingStatusRef.current(
      getCompactionCompletedThinkingStatus(),
      conversationRef,
    );
    setThinkingSourceEventTypeRef.current('context-compaction-completed', conversationRef);
    setCompactionDebugInfoRef.current(
      buildCompactionDebugInfo(payload, skippedReason),
      conversationRef,
    );
    const snapshot = hasCompactionReplacementHistoryEntries(payload)
      ? buildCompactedReplaySnapshot(event, conversationRef)
      : null;
    if (snapshot) {
      void persistCompactedReplayRef.current(
        snapshot,
        resolveCompactionUserId(payload),
      ).catch((error) => {
        console.warn('[useChatStreamCompactionHandlers] Failed to persist compacted replay state:', error);
      });
    }
    recordTrackingEventRef.current('context-compaction-completed', turnRef, {}, conversationRef);
  }, [
    getThinkingSourceEventTypeRef,
    persistCompactedReplayRef,
    recordTrackingEventRef,
    setCompactionDebugInfoRef,
    setThinkingSourceEventTypeRef,
    setThinkingStatusRef,
  ]);

  const handleContextCompactionFailed = useCallback((event: ConversationEvent) => {
    if (!isCompactionFailedConversationStreamEvent(event)) {
      return;
    }
    const conversationRef = resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    const errorText = resolveCompactionErrorText(resolveConversationStreamEventPayload(event));
    setThinkingStatusRef.current(resolveCompactionFailedThinkingStatus(errorText), conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-failed', conversationRef);
    setCompactionDebugInfoRef.current(null, conversationRef);
    recordTrackingEventRef.current('context-compaction-failed', turnRef, {}, conversationRef);
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
