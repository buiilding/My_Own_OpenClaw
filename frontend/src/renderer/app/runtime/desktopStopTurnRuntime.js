/**
 * Provides stop-turn target and terminal SDK live-turn helpers for renderer app-runtime consumers.
 */

import {
  DesktopChatWorkspaceStateRuntime,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';
import {
  DesktopChatPendingTurnStateRuntime,
} from './desktopChatPendingTurnStateRuntime';

const {
  buildNoViewSdkLiveTurnStorageUpdate,
  readNoViewSdkLiveTurnStorage,
} = DesktopChatWorkspaceStateRuntime;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;
const {
  normalizePendingTurn,
} = DesktopChatPendingTurnStateRuntime;

function readExactNonEmptyRef(value) {
  return typeof value === 'string' && value && value.trim() === value ? value : null;
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
  const conversationRef = readExactNonEmptyRef(input.conversationRef);
  const turnRef = readExactNonEmptyRef(input.turnRef);
  const sdkLiveTurnConversationRef = readExactNonEmptyRef(sdkLiveTurn.conversationRef);
  const sdkLiveTurnRef = readExactNonEmptyRef(sdkLiveTurn.turnRef);
  return (
    Boolean(conversationRef && turnRef)
    && sdkLiveTurnConversationRef === conversationRef
    && sdkLiveTurnRef === turnRef
  );
}

function doesPendingTurnMatch(pendingTurn, input = null) {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return false;
  }
  if (!input) {
    return true;
  }
  const conversationRef = readExactNonEmptyRef(input.conversationRef);
  const turnRef = readExactNonEmptyRef(input.turnRef);
  return (
    Boolean(conversationRef && turnRef)
    && normalizedPendingTurn.conversationRef === conversationRef
    && normalizedPendingTurn.turnRef === turnRef
  );
}

function isSdkConversationView(conversationView) {
  return hasWorkspaceConversationView({ conversationView });
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
    conversationRef: readExactNonEmptyRef(conversationRef),
    turnRef: readExactNonEmptyRef(turnRef),
  };
  if (!target.conversationRef || !target.turnRef) {
    return null;
  }
  const hasSdkConversationView = hasWorkspaceConversationView(currentWorkspace);
  const workspaceSdkLiveTurn = hasSdkConversationView
    ? null
    : readNoViewSdkLiveTurnStorage(currentWorkspace);
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
  const nextWorkspace = buildNoViewSdkLiveTurnStorageUpdate(
    currentWorkspace,
    hasSdkConversationView ? null : nextSdkLiveTurn,
  );
  return {
    ...nextWorkspace,
    isSending: nextPendingTurn ? currentWorkspace.isSending : false,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    pendingTurn: nextPendingTurn,
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
  const conversationRef = readExactNonEmptyRef(input?.conversationRef);
  const turnRef = readExactNonEmptyRef(input?.turnRef);
  if (!conversationRef || !turnRef) {
    return null;
  }
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

function buildStopTurnExecutionPlan(stopTarget = null) {
  const target = stopTarget && typeof stopTarget === 'object'
    ? stopTarget
    : {};
  const conversationRef = readExactNonEmptyRef(target.conversationRef);
  const turnRef = readExactNonEmptyRef(target.turnRef);
  const canStop = target.canStop === true && Boolean(conversationRef && turnRef);
  return {
    canStop,
    conversationRef,
    turnRef,
    shouldClearPendingBridge: canStop && isStopTurnTargetFromPendingTurn(target),
  };
}

function executeStopTurnExecutionPlan({
  deps = {},
  enabled = true,
  stopTarget = null,
  warningContext = 'StopTurnHandler',
} = {}) {
  const stopPlan = buildStopTurnExecutionPlan(stopTarget);
  if (!enabled || !stopPlan.canStop) {
    return false;
  }
  if (stopPlan.conversationRef && typeof deps.setActiveConversationRef === 'function') {
    deps.setActiveConversationRef(stopPlan.conversationRef);
  }
  if (typeof deps.acceptStoppedTurn === 'function') {
    deps.acceptStoppedTurn({
      conversationRef: stopPlan.conversationRef,
      turnRef: stopPlan.turnRef,
    });
  }
  if (typeof deps.stopPlayback === 'function') {
    deps.stopPlayback();
  }
  if (stopPlan.shouldClearPendingBridge && typeof deps.clearPendingTurn === 'function') {
    try {
      deps.clearPendingTurn({
        conversationRef: stopPlan.conversationRef,
        turnRef: stopPlan.turnRef,
      });
    } catch (error) {
      console.warn(`[${warningContext}] Failed to clear pending turn before stop:`, error);
    }
  }
  if (typeof deps.stopLiveTurn === 'function') {
    void Promise.resolve(deps.stopLiveTurn(
      stopPlan.conversationRef,
      stopPlan.turnRef,
    )).catch((error) => {
      console.warn(`[${warningContext}] Failed to stop query:`, error);
    });
  }
  return true;
}

function isStoppableConversationView(conversationView) {
  return Boolean(
    isSdkConversationView(conversationView)
      && conversationView.liveTurn?.canStop === true
      && readExactNonEmptyRef(conversationView.conversationRef)
      && readExactNonEmptyRef(conversationView.liveTurn?.turnRef)
  );
}

function pendingTurnMatchesConversationView(conversationView, pendingTurn) {
  const viewConversationRef = readExactNonEmptyRef(conversationView?.conversationRef);
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  return Boolean(
    viewConversationRef
      && normalizedPendingTurn
      && normalizedPendingTurn.conversationRef === viewConversationRef,
  );
}

function resolveStopTurnTarget({
  conversationView = null,
  pendingTurn = null,
} = {}) {
  if (isStoppableConversationView(conversationView)) {
    return {
      source: 'conversation-view',
      conversationRef: readExactNonEmptyRef(conversationView.conversationRef),
      turnRef: readExactNonEmptyRef(conversationView.liveTurn?.turnRef),
      canStop: true,
    };
  }

  if (isSdkConversationView(conversationView)) {
    if (pendingTurnMatchesConversationView(conversationView, pendingTurn)) {
      const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
      return {
        source: 'pending-turn',
        conversationRef: normalizedPendingTurn.conversationRef,
        turnRef: normalizedPendingTurn.turnRef,
        canStop: true,
      };
    }
    return null;
  }

  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (normalizedPendingTurn) {
    return {
      source: 'pending-turn',
      conversationRef: normalizedPendingTurn.conversationRef,
      turnRef: normalizedPendingTurn.turnRef,
      canStop: true,
    };
  }

  return null;
}

export const DesktopStopTurnRuntime = Object.freeze({
  buildAcceptStoppedTurnStateUpdate,
  executeStopTurnExecutionPlan,
  resolveStopTurnTarget,
});
