/**
 * Derives renderer chat UI side effects from SDK current-turn projections.
 */

import type { CurrentTurnToolEvent } from '../../../../infrastructure/api/agentSdkClient';
import type { SdkCurrentTurnProjection } from '../../stores/chatStore';
import { buildThinkingStatus } from '../chatStream/chatStreamFormatting';
import { GENERIC_THINKING_STATUS } from '../chatStream/chatStreamThinkingStatus';
import type { recordTrackingEvent as recordTrackingEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';

export type ProjectionCursor = {
  assistantLength: number;
  reasoningLength: number;
  phase: string | null;
  typingVisible: boolean | null;
  lastError: string | null;
  toolEventIds: Set<string>;
};

type WorkspaceState = {
  thinkingStatus?: string | null;
};

type CurrentTurnProjectionSideEffectDeps = {
  getWorkspaceState: (conversationRef?: string | null) => WorkspaceState;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (sourceEventType: string | null, conversationRef?: string | null) => void;
  updateStreamTracking: (updater: (current: unknown) => unknown, conversationRef?: string | null) => void;
  recordTrackingEvent: typeof recordTrackingEventRuntime;
};

type ApplyCurrentTurnProjectionSideEffectsInput = {
  conversationRef: string;
  currentTurn: SdkCurrentTurnProjection;
  cursor: ProjectionCursor;
  deps: CurrentTurnProjectionSideEffectDeps;
};

export function createProjectionCursor(): ProjectionCursor {
  return {
    assistantLength: 0,
    reasoningLength: 0,
    phase: null,
    typingVisible: null,
    lastError: null,
    toolEventIds: new Set<string>(),
  };
}

export function buildProjectionCursorKey(
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

export function shouldAcceptCurrentTurnBeforeLocalSend(currentTurn: SdkCurrentTurnProjection): boolean {
  return currentTurn.phase === 'awaiting';
}

export function applyCurrentTurnProjectionSideEffects({
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
  const sdkTypingVisible = resolveSdkPresentationTypingVisible(currentTurn);
  const shouldShowTyping = sdkTypingVisible ?? (currentTurn.phase === 'awaiting');
  const hasSdkVisibleContent = resolveSdkPresentationHasVisibleContent(currentTurn);

  if (currentTurn.phase === 'awaiting' && cursor.phase !== 'awaiting') {
    deps.setIsSending(shouldShowTyping, conversationRef);
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

  if (!shouldShowTyping && cursor.typingVisible === true) {
    deps.setIsSending(false, conversationRef);
  }

  if (reasoningDelta) {
    const workspace = deps.getWorkspaceState(conversationRef);
    const nextBaseStatus = workspace.thinkingStatus === GENERIC_THINKING_STATUS
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
      if (!isSkipFrontendExecutionToolEvent(toolEvent)) {
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
    typingVisible: shouldShowTyping,
    lastError: currentTurn.lastError ?? null,
    toolEventIds: nextToolEventIds,
  };
}
