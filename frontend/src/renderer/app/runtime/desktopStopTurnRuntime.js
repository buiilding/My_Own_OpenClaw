/**
 * Provides stop-turn target and terminal projection helpers for renderer app-runtime consumers.
 */

const STOPPABLE_CURRENT_TURN_PHASES = new Set([
  'awaiting',
  'streaming',
  'tool_call',
  'tool_output',
]);

function normalizeRef(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildStopQueryTrackingPatch(stoppedAt) {
  return {
    phase: 'complete',
    completedAt: stoppedAt,
    lastEventAt: stoppedAt,
    lastEventType: 'stop-query',
  };
}

function hasVisibleCurrentTurnContent(presentation) {
  return (
    presentation?.hasVisibleContent === true
    || (Array.isArray(presentation?.entries) && presentation.entries.length > 0)
  );
}

function buildStoppedCurrentTurnProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return null;
  }
  const presentation = currentTurnProjection.presentation;
  if (!presentation || typeof presentation !== 'object') {
    return {
      ...currentTurnProjection,
      phase: 'complete',
    };
  }
  const hasVisibleContent = hasVisibleCurrentTurnContent(presentation);
  const overlayIntent = presentation.overlayIntent && typeof presentation.overlayIntent === 'object'
    ? presentation.overlayIntent
    : {};
  return {
    ...currentTurnProjection,
    phase: 'complete',
    presentation: {
      ...presentation,
      phase: 'complete',
      isBusy: false,
      isTerminal: true,
      typingVisible: false,
      overlayVisible: hasVisibleContent,
      overlayIntent: {
        ...overlayIntent,
        visible: hasVisibleContent,
        mode: hasVisibleContent ? 'response' : 'hidden',
      },
    },
  };
}

function isStopTurnTargetFromCurrentTurn(stopTarget) {
  return stopTarget?.source === 'sdk-current-turn';
}

function isStopTurnTargetFromPendingTurn(stopTarget) {
  return stopTarget?.source === 'pending-turn';
}

function isStoppableCurrentTurnProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return false;
  }
  const phase = normalizeRef(currentTurnProjection.phase);
  return (
    STOPPABLE_CURRENT_TURN_PHASES.has(phase)
    || currentTurnProjection.presentation?.isBusy === true
  );
}

function isPendingTurn(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && normalizeRef(value.conversationRef)
      && normalizeRef(value.turnRef)
  );
}

function resolveStopTurnTarget({
  currentTurnProjection = null,
  pendingTurn = null,
  conversationRef = null,
} = {}) {
  if (isStoppableCurrentTurnProjection(currentTurnProjection)) {
    const resolvedConversationRef = normalizeRef(currentTurnProjection.conversationRef) || normalizeRef(conversationRef);
    const resolvedTurnRef = normalizeRef(currentTurnProjection.turnRef);
    return {
      source: 'sdk-current-turn',
      conversationRef: resolvedConversationRef,
      turnRef: resolvedTurnRef,
      canStop: Boolean(resolvedConversationRef),
    };
  }

  if (isPendingTurn(pendingTurn)) {
    return {
      source: 'pending-turn',
      conversationRef: normalizeRef(pendingTurn.conversationRef),
      turnRef: normalizeRef(pendingTurn.turnRef),
      canStop: true,
    };
  }

  const fallbackConversationRef = normalizeRef(conversationRef);
  return {
    source: 'idle',
    conversationRef: fallbackConversationRef,
    turnRef: null,
    canStop: false,
  };
}

export const DesktopStopTurnRuntime = Object.freeze({
  buildStopQueryTrackingPatch,
  buildStoppedCurrentTurnProjection,
  isStopTurnTargetFromCurrentTurn,
  isStopTurnTargetFromPendingTurn,
  resolveStopTurnTarget,
});
