import { useCallback } from 'react';
import type {
  BackendEvent,
  BackendEventType,
  ContextCompactionCompletedEvent,
  ContextCompactionFailedEvent,
  ContextCompactionStartedEvent,
} from '../../../types/backendEvents';
import {
  COMPACTION_THINKING_STATUS,
  COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
} from '../utils/chatStream/chatStreamThinkingStatus';
import type { StreamTrackingOptions } from '../utils/chatStream/chatStreamTracking';

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

type RecordTrackingEvent = (
  eventType: BackendEventType,
  turnRef: string | null | undefined,
  options?: StreamTrackingOptions,
  conversationRef?: string | null,
) => void;

export function useChatStreamCompactionHandlers({
  resolveTargetConversationRef,
  shouldIgnoreForStaleTurn,
  setThinkingStatus,
  setThinkingSourceEventType,
  recordTrackingEvent,
}: {
  resolveTargetConversationRef: ResolveTargetConversationRef;
  shouldIgnoreForStaleTurn: ShouldIgnoreForStaleTurn;
  setThinkingStatus: SetThinkingStatus;
  setThinkingSourceEventType: SetThinkingSourceEventType;
  recordTrackingEvent: RecordTrackingEvent;
}) {
  const handleContextCompactionStarted = useCallback((event: ContextCompactionStartedEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    setThinkingStatus(COMPACTION_THINKING_STATUS, conversationRef);
    setThinkingSourceEventType('context-compaction-started', conversationRef);
    recordTrackingEvent('context-compaction-started', event.turn_ref, {}, conversationRef);
  }, [
    recordTrackingEvent,
    resolveTargetConversationRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    shouldIgnoreForStaleTurn,
  ]);

  const handleContextCompactionCompleted = useCallback((event: ContextCompactionCompletedEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    const skippedReason = (
      typeof event.payload?.skipped_reason === 'string'
        ? event.payload.skipped_reason.trim()
        : ''
    );
    setThinkingStatus(
      skippedReason
        ? COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS
        : COMPACTION_COMPLETED_THINKING_STATUS,
      conversationRef,
    );
    setThinkingSourceEventType('context-compaction-completed', conversationRef);
    recordTrackingEvent('context-compaction-completed', event.turn_ref, {}, conversationRef);
  }, [
    recordTrackingEvent,
    resolveTargetConversationRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    shouldIgnoreForStaleTurn,
  ]);

  const handleContextCompactionFailed = useCallback((event: ContextCompactionFailedEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    const errorText = (
      typeof event.payload?.error === 'string'
        ? event.payload.error.trim()
        : ''
    );
    setThinkingStatus(errorText || COMPACTION_FAILED_THINKING_STATUS, conversationRef);
    setThinkingSourceEventType('context-compaction-failed', conversationRef);
    recordTrackingEvent('context-compaction-failed', event.turn_ref, {}, conversationRef);
  }, [
    recordTrackingEvent,
    resolveTargetConversationRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    shouldIgnoreForStaleTurn,
  ]);

  return {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  };
}
