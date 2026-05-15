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
import { getConversationWorkspaceBinding } from '../../../../infrastructure/workspace/conversationWorkspaceBinding';
import { replaceConversationReplayState } from '../../../../infrastructure/transcript/conversationReplayState';
import { useTurnScopedBackendEventHandler } from './useTurnScopedBackendEventHandler';

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

export function useChatStreamCompactionHandlers({
  resolveTargetConversationRef,
  shouldIgnoreForStaleTurn,
  setThinkingStatus,
  setThinkingSourceEventType,
  setCompactionDebugInfo,
  recordTrackingEvent,
}: {
  resolveTargetConversationRef: ResolveTargetConversationRef;
  shouldIgnoreForStaleTurn: ShouldIgnoreForStaleTurn;
  setThinkingStatus: SetThinkingStatus;
  setThinkingSourceEventType: SetThinkingSourceEventType;
  setCompactionDebugInfo: SetCompactionDebugInfo;
  recordTrackingEvent: RecordTrackingEvent;
}) {
  const handleContextCompactionStarted = useTurnScopedBackendEventHandler<ContextCompactionStartedEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      setThinkingStatus(COMPACTION_THINKING_STATUS, conversationRef);
      setThinkingSourceEventType('context-compaction-started', conversationRef);
      setCompactionDebugInfo(null, conversationRef);
      recordTrackingEvent('context-compaction-started', event.turn_ref, {}, conversationRef);
    },
  });

  const handleContextCompactionCompleted = useTurnScopedBackendEventHandler<ContextCompactionCompletedEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      const skippedReason = (
        typeof event.payload?.skipped_reason === 'string'
          ? event.payload.skipped_reason.trim()
          : ''
      );
      if (skippedReason) {
        setThinkingStatus(null, conversationRef);
        setThinkingSourceEventType(null, conversationRef);
        setCompactionDebugInfo(null, conversationRef);
        recordTrackingEvent('context-compaction-completed', event.turn_ref, { skippedReason }, conversationRef);
        return;
      }
      setThinkingStatus(
        COMPACTION_COMPLETED_THINKING_STATUS,
        conversationRef,
      );
      setThinkingSourceEventType('context-compaction-completed', conversationRef);
      setCompactionDebugInfo({
        reason: typeof event.payload?.reason === 'string' ? event.payload.reason : null,
        strategy: typeof event.payload?.strategy === 'string' ? event.payload.strategy : null,
        beforeTokens: typeof event.payload?.before_tokens === 'number' ? event.payload.before_tokens : null,
        afterTokens: typeof event.payload?.after_tokens === 'number' ? event.payload.after_tokens : null,
        removedMessages: typeof event.payload?.removed_messages === 'number' ? event.payload.removed_messages : null,
        summaryPreview: typeof event.payload?.summary_preview === 'string' ? event.payload.summary_preview : null,
        summaryText: typeof event.payload?.summary_text === 'string' ? event.payload.summary_text : null,
        replacementHistoryPreview: Array.isArray(event.payload?.replacement_history_preview)
          ? event.payload.replacement_history_preview.map((entry) => ({
            role: typeof entry?.role === 'string' ? entry.role : null,
            messageType: typeof entry?.message_type === 'string' ? entry.message_type : null,
            content: typeof entry?.content === 'string' ? entry.content : null,
            toolName: typeof entry?.tool_name === 'string' ? entry.tool_name : null,
            toolCallId: typeof entry?.tool_call_id === 'string' ? entry.tool_call_id : null,
          }))
          : [],
        skippedReason: skippedReason || null,
      }, conversationRef);
      const replacementHistoryEntries = Array.isArray(event.payload?.replacement_history_entries)
        ? event.payload.replacement_history_entries
            .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        : [];
      if (!skippedReason && conversationRef && replacementHistoryEntries.length > 0) {
        const workspaceBinding = getConversationWorkspaceBinding(conversationRef);
        void replaceConversationReplayState(
          {
            conversationRef,
            userId: event.user_id || 'default_user',
            workspacePath: workspaceBinding.workspacePath || null,
            workspaceName: workspaceBinding.workspaceName || null,
          },
          replacementHistoryEntries.map((rehydrateEntry, index) => ({
            messageIndex: index + 1,
            rehydrateEntry,
          })),
        ).catch((error) => {
          console.warn('[useChatStreamCompactionHandlers] Failed to persist compacted replay state:', error);
        });
      }
      recordTrackingEvent('context-compaction-completed', event.turn_ref, {}, conversationRef);
    },
  });

  const handleContextCompactionFailed = useTurnScopedBackendEventHandler<ContextCompactionFailedEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      const errorText = (
        typeof event.payload?.error === 'string'
          ? event.payload.error.trim()
          : ''
      );
      setThinkingStatus(errorText || COMPACTION_FAILED_THINKING_STATUS, conversationRef);
      setThinkingSourceEventType('context-compaction-failed', conversationRef);
      setCompactionDebugInfo(null, conversationRef);
      recordTrackingEvent('context-compaction-failed', event.turn_ref, {}, conversationRef);
    },
  });

  return {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  };
}
