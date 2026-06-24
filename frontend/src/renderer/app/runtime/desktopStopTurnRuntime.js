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
  return Array.isArray(presentation?.entries) && presentation.entries.length > 0;
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
  const nextPresentation = { ...presentation };
  delete nextPresentation.typingVisible;
  delete nextPresentation.overlayVisible;
  delete nextPresentation.hasVisibleContent;
  return {
    ...currentTurnProjection,
    phase: 'complete',
    presentation: {
      ...nextPresentation,
      phase: 'complete',
      isBusy: false,
      isTerminal: true,
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

function isStopTurnTargetFromConversationView(stopTarget) {
  return stopTarget?.source === 'conversation-view';
}

function isStopTurnTargetFromPendingTurn(stopTarget) {
  return stopTarget?.source === 'pending-turn';
}

function isStoppableCurrentTurnProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return false;
  }
  const phase = normalizeRef(currentTurnProjection.phase);
  return STOPPABLE_CURRENT_TURN_PHASES.has(phase);
}

function isPendingTurn(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && normalizeRef(value.conversationRef)
      && normalizeRef(value.turnRef)
  );
}

function isStoppableConversationView(conversationView) {
  return Boolean(
    conversationView
      && typeof conversationView === 'object'
      && conversationView.liveTurn?.canStop === true
      && normalizeRef(conversationView.conversationRef)
      && normalizeRef(conversationView.liveTurn?.turnRef)
  );
}

function resolveStopTurnTarget({
  conversationView = null,
  currentTurnProjection = null,
  pendingTurn = null,
  conversationRef = null,
} = {}) {
  if (isStoppableConversationView(conversationView)) {
    return {
      source: 'conversation-view',
      conversationRef: normalizeRef(conversationView.conversationRef),
      turnRef: normalizeRef(conversationView.liveTurn?.turnRef),
      canStop: true,
    };
  }

  if (conversationView && typeof conversationView === 'object') {
    if (isPendingTurn(pendingTurn)) {
      return {
        source: 'pending-turn',
        conversationRef: normalizeRef(pendingTurn.conversationRef),
        turnRef: normalizeRef(pendingTurn.turnRef),
        canStop: true,
      };
    }
    return {
      source: 'idle',
      conversationRef: normalizeRef(conversationView.conversationRef) || normalizeRef(conversationRef),
      turnRef: normalizeRef(conversationView.liveTurn?.turnRef),
      canStop: false,
    };
  }

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
  isStopTurnTargetFromConversationView,
  isStopTurnTargetFromCurrentTurn,
  isStopTurnTargetFromPendingTurn,
  resolveStopTurnTarget,
});
