/**
 * Provides stop-turn target and terminal SDK live-turn helpers for renderer app-runtime consumers.
 */

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

function buildStoppedSdkLiveTurn(sdkLiveTurn) {
  if (!sdkLiveTurn || typeof sdkLiveTurn !== 'object') {
    return null;
  }
  const presentation = sdkLiveTurn.presentation;
  if (!presentation || typeof presentation !== 'object') {
    return {
      ...sdkLiveTurn,
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
    ...sdkLiveTurn,
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

function doesSdkLiveTurnMatch(sdkLiveTurn, input = null) {
  if (!sdkLiveTurn || !input) {
    return false;
  }
  const conversationRef = normalizeRef(input.conversationRef);
  const turnRef = normalizeRef(input.turnRef);
  const sdkLiveTurnConversationRef = normalizeRef(sdkLiveTurn.conversationRef);
  const sdkLiveTurnRef = normalizeRef(sdkLiveTurn.turnRef);
  return (
    (!conversationRef || sdkLiveTurnConversationRef === conversationRef)
    && (!turnRef || sdkLiveTurnRef === turnRef)
  );
}

function doesPendingTurnMatch(pendingTurn, input = null) {
  if (!pendingTurn) {
    return false;
  }
  if (!input) {
    return true;
  }
  const conversationRef = normalizeRef(input.conversationRef);
  const turnRef = normalizeRef(input.turnRef);
  return (
    (!conversationRef || normalizeRef(pendingTurn.conversationRef) === conversationRef)
    && (!turnRef || normalizeRef(pendingTurn.turnRef) === turnRef)
  );
}

function resolveStoppedAt(stoppedAt) {
  return typeof stoppedAt === 'string' && stoppedAt.trim()
    ? stoppedAt
    : new Date().toISOString();
}

function buildStoppedTurnWorkspaceMutation({
  conversationRef = null,
  currentWorkspace,
  sdkLiveTurn = null,
  stoppedAt = null,
  turnRef = null,
} = {}) {
  if (!currentWorkspace || typeof currentWorkspace !== 'object') {
    return null;
  }
  const target = {
    conversationRef: normalizeRef(conversationRef),
    turnRef: normalizeRef(turnRef),
  };
  const workspaceSdkLiveTurn = currentWorkspace.currentTurnProjection ?? null;
  const isWorkspaceSdkLiveTurnTarget = doesSdkLiveTurnMatch(workspaceSdkLiveTurn, target);
  const isPendingTurnTarget = doesPendingTurnMatch(currentWorkspace.pendingTurn, target);
  if (!isWorkspaceSdkLiveTurnTarget && !isPendingTurnTarget) {
    return null;
  }
  const sdkLiveTurnToStop = isWorkspaceSdkLiveTurnTarget
    ? workspaceSdkLiveTurn
    : sdkLiveTurn;
  const nextSdkLiveTurn = sdkLiveTurnToStop
    ? buildStoppedSdkLiveTurn(sdkLiveTurnToStop)
    : workspaceSdkLiveTurn;
  const nextPendingTurn = isPendingTurnTarget
    ? null
    : currentWorkspace.pendingTurn;
  const nextStoppedAt = resolveStoppedAt(stoppedAt);
  return {
    ...currentWorkspace,
    isSending: nextPendingTurn ? currentWorkspace.isSending : false,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    pendingTurn: nextPendingTurn,
    currentTurnProjection: nextSdkLiveTurn,
    streamTracking: {
      ...currentWorkspace.streamTracking,
      ...buildStopQueryTrackingPatch(nextStoppedAt),
    },
  };
}

function buildAcceptStoppedTurnStateUpdate({
  deps,
  input = null,
  state,
} = {}) {
  if (!deps || !state) {
    return null;
  }
  const conversationRef = normalizeRef(input?.conversationRef);
  const turnRef = normalizeRef(input?.turnRef);
  const workspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, workspaceRef);
  const nextWorkspace = buildStoppedTurnWorkspaceMutation({
    conversationRef,
    currentWorkspace,
    stoppedAt: input?.stoppedAt,
    turnRef,
  });
  if (!nextWorkspace) {
    return null;
  }
  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
}

function isStopTurnTargetFromPendingTurn(stopTarget) {
  return stopTarget?.source === 'pending-turn';
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
  buildAcceptStoppedTurnStateUpdate,
  buildStopQueryTrackingPatch,
  buildStoppedTurnWorkspaceMutation,
  buildStoppedSdkLiveTurn,
  isStopTurnTargetFromPendingTurn,
  resolveStopTurnTarget,
});
