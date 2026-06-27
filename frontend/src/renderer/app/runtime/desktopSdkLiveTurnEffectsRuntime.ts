/**
 * Derives renderer chat UI side effects from SDK live-turn snapshots.
 */

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
  thinkingLength: number;
  phase: string | null;
  lastError: string | null;
  liveEntryIds: Set<string>;
};

type WorkspaceState = {
  thinkingStatus?: string | null;
};

type SdkLiveTurnPresentationEntry = {
  id?: string | null;
  type?: string | null;
  text?: string | null;
  executionSkipped?: boolean | null;
  [key: string]: unknown;
};

type SdkLiveTurnPresentation = {
  entries?: SdkLiveTurnPresentationEntry[] | null;
  lastError?: string | null;
  [key: string]: unknown;
};

export type SdkLiveTurnEffectsInput = {
  conversationRef?: string | null;
  phase: string;
  presentation?: SdkLiveTurnPresentation | null;
  turnRef?: string | null;
  userMessageRowId?: string | null;
};

type SdkLiveTurnSideEffectDeps = {
  getWorkspaceState: (conversationRef?: string | null) => WorkspaceState;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (sourceEventType: string | null, conversationRef?: string | null) => void;
  updateStreamTracking: (updater: (current: unknown) => unknown, conversationRef?: string | null) => void;
  recordTrackingEvent: DesktopChatStreamRecordTrackingEvent;
};

type ApplySdkLiveTurnSideEffectsInput = {
  conversationRef: string;
  currentTurn: SdkLiveTurnEffectsInput;
  cursor: ProjectionCursor;
  deps: SdkLiveTurnSideEffectDeps;
};

function createProjectionCursor(): ProjectionCursor {
  return {
    assistantLength: 0,
    thinkingLength: 0,
    phase: null,
    lastError: null,
    liveEntryIds: new Set<string>(),
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

function normalizeEntryText(entry: SdkLiveTurnPresentationEntry): string {
  return typeof entry.text === 'string' ? entry.text : '';
}

function readPresentationEntries(currentTurn: SdkLiveTurnEffectsInput): SdkLiveTurnPresentationEntry[] {
  return Array.isArray(currentTurn.presentation?.entries)
    ? currentTurn.presentation.entries
    : [];
}

function concatEntryTextByType(
  entries: SdkLiveTurnPresentationEntry[],
  type: string,
): string {
  return entries
    .filter((entry) => entry.type === type)
    .map(normalizeEntryText)
    .join('');
}

function resolveSdkPresentationHasVisibleContent(currentTurn: SdkLiveTurnEffectsInput): boolean {
  const presentation = asRecord((currentTurn as { presentation?: unknown }).presentation);
  if (Array.isArray(presentation?.entries) && presentation.entries.length > 0) {
    return true;
  }
  return typeof presentation?.lastError === 'string'
    && presentation.lastError.trim().length > 0;
}

function resolveSdkPresentationLastError(currentTurn: SdkLiveTurnEffectsInput): string | null {
  return typeof currentTurn.presentation?.lastError === 'string'
    ? currentTurn.presentation.lastError
    : null;
}

function isExecutionSkippedToolEntry(entry: SdkLiveTurnPresentationEntry): boolean {
  return entry.executionSkipped === true;
}

function presentationEntryId(entry: SdkLiveTurnPresentationEntry, index: number): string {
  return typeof entry.id === 'string' && entry.id.trim()
    ? entry.id.trim()
    : `entry:${index}:${entry.type || 'unknown'}`;
}

function shouldAcceptCurrentTurnBeforeLocalSend(currentTurn: SdkLiveTurnEffectsInput): boolean {
  return currentTurn.phase === 'awaiting';
}

function applySdkLiveTurnSideEffects({
  conversationRef,
  currentTurn,
  cursor,
  deps,
}: ApplySdkLiveTurnSideEffectsInput): ProjectionCursor {
  const entries = readPresentationEntries(currentTurn);
  const assistantEntryText = concatEntryTextByType(entries, 'llm-text');
  const thinkingEntryText = concatEntryTextByType(entries, 'thinking');
  const assistantDelta = getProjectionTextDelta(
    assistantEntryText,
    cursor.assistantLength,
  );
  const thinkingDelta = getProjectionTextDelta(
    thinkingEntryText,
    cursor.thinkingLength,
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

  if (thinkingDelta) {
    const workspace = deps.getWorkspaceState(conversationRef);
    const nextBaseStatus = isGenericThinkingStatus(workspace.thinkingStatus)
      ? null
      : workspace.thinkingStatus;
    deps.setThinkingStatus(buildThinkingStatus(nextBaseStatus, thinkingDelta), conversationRef);
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

  const nextLiveEntryIds = new Set(cursor.liveEntryIds);
  entries.forEach((entry, index) => {
    const entryId = presentationEntryId(entry, index);
    if (nextLiveEntryIds.has(entryId)) {
      return;
    }
    nextLiveEntryIds.add(entryId);
    if (entry.type === 'tool-call') {
      if (!isExecutionSkippedToolEntry(entry)) {
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
    } else if (entry.type === 'tool-output') {
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
    } else if (entry.type === 'tool-progress') {
      deps.recordTrackingEvent(
        deps.updateStreamTracking,
        'web-search-progress',
        currentTurn.turnRef,
        { phase: 'tool-call', toolCall: true },
        conversationRef,
      );
    }
  });

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
    const currentError = resolveSdkPresentationLastError(currentTurn);
    const errorText = typeof currentError === 'string' && currentError.trim()
      ? currentError
      : 'Unknown runtime error';
    deps.setIsSending(false, conversationRef);
    deps.setThinkingStatus('', conversationRef);
    deps.setThinkingSourceEventType(null, conversationRef);
    if (cursor.phase !== 'error' || cursor.lastError !== currentError) {
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
    assistantLength: assistantEntryText.length,
    thinkingLength: thinkingEntryText.length,
    phase: currentTurn.phase,
    lastError: resolveSdkPresentationLastError(currentTurn),
    liveEntryIds: nextLiveEntryIds,
  };
}

export const DesktopSdkLiveTurnEffectsRuntime = Object.freeze({
  createProjectionCursor,
  buildProjectionCursorKey,
  shouldAcceptCurrentTurnBeforeLocalSend,
  applySdkLiveTurnSideEffects,
});
