/**
 * Derives renderer chat UI side effects from SDK current-turn projections.
 */

import type { CurrentTurnToolEvent } from './desktopConversationRuntimeContracts';
import {
  DesktopChatStreamThinkingRuntime,
} from './desktopChatStreamThinkingRuntime';
import type { DesktopChatStreamRecordTrackingEvent } from './desktopChatStreamEventRuntime';

const {
  buildThinkingStatus,
  isGenericThinkingStatus,
} = DesktopChatStreamThinkingRuntime;

export type ProjectionCursor = {
  assistantLength: number;
  reasoningLength: number;
  phase: string | null;
  lastError: string | null;
  toolEventIds: Set<string>;
};

type WorkspaceState = {
  thinkingStatus?: string | null;
};

export type CurrentTurnProjectionEffectsInput = {
  assistantText?: string | null;
  conversationRef?: string | null;
  lastError?: string | null;
  phase: string;
  presentation?: unknown;
  reasoningText?: string | null;
  toolEvents: CurrentTurnToolEvent[];
  turnRef?: string | null;
  userMessageRowId?: string | null;
};

type CurrentTurnProjectionSideEffectDeps = {
  getWorkspaceState: (conversationRef?: string | null) => WorkspaceState;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (sourceEventType: string | null, conversationRef?: string | null) => void;
  updateStreamTracking: (updater: (current: unknown) => unknown, conversationRef?: string | null) => void;
  recordTrackingEvent: DesktopChatStreamRecordTrackingEvent;
};

type ApplyCurrentTurnProjectionSideEffectsInput = {
  conversationRef: string;
  currentTurn: CurrentTurnProjectionEffectsInput;
  cursor: ProjectionCursor;
  deps: CurrentTurnProjectionSideEffectDeps;
};

function createProjectionCursor(): ProjectionCursor {
  return {
    assistantLength: 0,
    reasoningLength: 0,
    phase: null,
    lastError: null,
    toolEventIds: new Set<string>(),
  };
}

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

function resolveSdkPresentationHasVisibleContent(currentTurn: CurrentTurnProjectionEffectsInput): boolean {
  const presentation = asRecord((currentTurn as { presentation?: unknown }).presentation);
  if (Array.isArray(presentation?.entries) && presentation.entries.length > 0) {
    return true;
  }
  return typeof presentation?.lastError === 'string'
    && presentation.lastError.trim().length > 0;
}

function isExecutionSkippedToolEvent(toolEvent: CurrentTurnToolEvent): boolean {
  return toolEvent.executionSkipped === true;
}

function shouldAcceptCurrentTurnBeforeLocalSend(currentTurn: CurrentTurnProjectionEffectsInput): boolean {
  return currentTurn.phase === 'awaiting';
}

function applyCurrentTurnProjectionSideEffects({
  conversationRef,
  currentTurn,
  cursor,
  deps,
}: ApplyCurrentTurnProjectionSideEffectsInput): ProjectionCursor {
  const assistantText = typeof currentTurn.assistantText === 'string'
    ? currentTurn.assistantText
    : '';
  const reasoningText = typeof currentTurn.reasoningText === 'string'
    ? currentTurn.reasoningText
    : '';
  const assistantDelta = getProjectionTextDelta(
    assistantText,
    cursor.assistantLength,
  );
  const reasoningDelta = getProjectionTextDelta(
    reasoningText,
    cursor.reasoningLength,
  );
  const hasSdkVisibleContent = resolveSdkPresentationHasVisibleContent(currentTurn);

  if (currentTurn.phase === 'awaiting' && cursor.phase !== 'awaiting') {
    deps.setIsSending(true, conversationRef);
    deps.setThinkingStatus(null, conversationRef);
    deps.setThinkingSourceEventType(null, conversationRef);
    deps.recordTrackingEvent(
      deps.updateStreamTracking,
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
    const workspace = deps.getWorkspaceState(conversationRef);
    const nextBaseStatus = isGenericThinkingStatus(workspace.thinkingStatus)
      ? null
      : workspace.thinkingStatus;
    deps.setThinkingStatus(buildThinkingStatus(nextBaseStatus, reasoningDelta), conversationRef);
    deps.setThinkingSourceEventType('llm-thought', conversationRef);
    deps.recordTrackingEvent(
      deps.updateStreamTracking,
      'llm-thought',
      currentTurn.turnRef,
      {},
      conversationRef,
    );
  }

  if (hasSdkVisibleContent) {
    deps.setIsSending(false, conversationRef);
  }

  if (assistantDelta) {
    deps.setIsSending(false, conversationRef);
    deps.recordTrackingEvent(
      deps.updateStreamTracking,
      'streaming-response',
      currentTurn.turnRef,
      {
        phase: 'streaming',
        chunkSize: assistantDelta.length,
      },
      conversationRef,
    );
  }

  const nextToolEventIds = new Set(cursor.toolEventIds);
  for (const toolEvent of currentTurn.toolEvents) {
    if (nextToolEventIds.has(toolEvent.id)) {
      continue;
    }
    nextToolEventIds.add(toolEvent.id);
    if (toolEvent.kind === 'tool_call') {
      if (!isExecutionSkippedToolEvent(toolEvent)) {
        deps.setIsSending(false, conversationRef);
        deps.setThinkingStatus(null, conversationRef);
        deps.setThinkingSourceEventType(null, conversationRef);
      }
      deps.recordTrackingEvent(
        deps.updateStreamTracking,
        'tool-call',
        currentTurn.turnRef,
        { phase: 'tool-call', toolCall: true },
        conversationRef,
      );
    } else if (toolEvent.kind === 'tool_output') {
      deps.setIsSending(false, conversationRef);
      deps.setThinkingStatus(null, conversationRef);
      deps.setThinkingSourceEventType(null, conversationRef);
      deps.recordTrackingEvent(
        deps.updateStreamTracking,
        'tool-output',
        currentTurn.turnRef,
        { phase: 'tool-output', toolOutput: true },
        conversationRef,
      );
    } else if (toolEvent.kind === 'tool_progress') {
      deps.recordTrackingEvent(
        deps.updateStreamTracking,
        'web-search-progress',
        currentTurn.turnRef,
        { phase: 'tool-call', toolCall: true },
        conversationRef,
      );
    }
  }

  if (currentTurn.phase === 'complete') {
    deps.setIsSending(false, conversationRef);
    deps.setThinkingStatus(null, conversationRef);
    deps.setThinkingSourceEventType(null, conversationRef);
    if (cursor.phase !== 'complete') {
      deps.recordTrackingEvent(
        deps.updateStreamTracking,
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
    deps.setIsSending(false, conversationRef);
    deps.setThinkingStatus('', conversationRef);
    deps.setThinkingSourceEventType(null, conversationRef);
    if (cursor.phase !== 'error' || cursor.lastError !== currentTurn.lastError) {
      deps.recordTrackingEvent(
        deps.updateStreamTracking,
        'error',
        currentTurn.turnRef,
        { phase: 'error', errorText },
        conversationRef,
      );
    }
  }

  return {
    assistantLength: assistantText.length,
    reasoningLength: reasoningText.length,
    phase: currentTurn.phase,
    lastError: currentTurn.lastError ?? null,
    toolEventIds: nextToolEventIds,
  };
}

export const DesktopCurrentTurnProjectionEffectsRuntime = Object.freeze({
  createProjectionCursor,
  buildProjectionCursorKey,
  shouldAcceptCurrentTurnBeforeLocalSend,
  applyCurrentTurnProjectionSideEffects,
});
