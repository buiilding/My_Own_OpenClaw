/**
 * Handles use chat stream compaction handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type {
  CompactedReplaySnapshot,
  ConversationEvent,
} from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { DesktopChatStreamEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';
import { DesktopChatStreamEventPayloadRuntime } from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import {
  DesktopChatStreamThinkingRuntime,
} from '../../../../app/runtime/desktopChatStreamThinkingRuntime';
import {
  DesktopChatStreamCompactionRuntime,
} from '../../../../app/runtime/desktopChatStreamCompactionRuntime';
import type {
  StreamTrackingEventType,
  StreamTrackingOptions,
} from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import { DesktopRendererHooksRuntimeClient } from '../../../../app/runtime/desktopRendererHooksRuntimeClient';

const {
  getCompactionCompletedThinkingStatus,
  getCompactionStartedThinkingStatus,
  resolveCompactionFailedThinkingStatus,
} = DesktopChatStreamThinkingRuntime;
const {
  persistCompactedReplaySnapshot,
} = DesktopChatStreamCompactionRuntime;
const {
  useLatestRef,
} = DesktopRendererHooksRuntimeClient;
const {
  isCompactionCompletedConversationStreamEvent,
  isCompactionFailedConversationStreamEvent,
  isCompactionSkippedConversationStreamEvent,
  isCompactionStartedConversationStreamEvent,
  resolveConversationStreamEventIdentity,
} = DesktopChatStreamEventRuntime;
const {
  buildCompactedReplaySnapshot,
  buildCompactionDebugInfo,
  hasCompactionReplacementHistoryEntries,
  resolveConversationStreamEventPayload,
  resolveCompactionErrorText,
  resolveCompactionSkippedReason,
  resolveCompactionUserId,
} = DesktopChatStreamEventPayloadRuntime;

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
    const eventIdentity = resolveConversationStreamEventIdentity(event);
    setThinkingStatusRef.current(getCompactionStartedThinkingStatus(), eventIdentity.conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-started', eventIdentity.conversationRef);
    setCompactionDebugInfoRef.current(null, eventIdentity.conversationRef);
    recordTrackingEventRef.current(
      'context-compaction-started',
      eventIdentity.turnRef,
      {},
      eventIdentity.conversationRef,
    );
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
    const eventIdentity = resolveConversationStreamEventIdentity(event);
    const conversationRef = eventIdentity.conversationRef;
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
      recordTrackingEventRef.current(
        'context-compaction-completed',
        eventIdentity.turnRef,
        {},
        conversationRef,
      );
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
    recordTrackingEventRef.current(
      'context-compaction-completed',
      eventIdentity.turnRef,
      {},
      conversationRef,
    );
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
    const eventIdentity = resolveConversationStreamEventIdentity(event);
    const conversationRef = eventIdentity.conversationRef;
    const errorText = resolveCompactionErrorText(resolveConversationStreamEventPayload(event));
    setThinkingStatusRef.current(resolveCompactionFailedThinkingStatus(errorText), conversationRef);
    setThinkingSourceEventTypeRef.current('context-compaction-failed', conversationRef);
    setCompactionDebugInfoRef.current(null, conversationRef);
    recordTrackingEventRef.current(
      'context-compaction-failed',
      eventIdentity.turnRef,
      {},
      conversationRef,
    );
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
