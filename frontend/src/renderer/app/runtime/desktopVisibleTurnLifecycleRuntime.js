/**
 * Owns renderer-visible turn lifecycle projection for desktop surfaces.
 */

import {
  DesktopConversationDisplayRowLookupRuntime,
} from './desktopConversationDisplayRowLookupRuntime';
import {
  DesktopChatPendingTurnStateRuntime,
} from './desktopChatPendingTurnStateRuntime';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

const TERMINAL_PHASES = new Set(['complete', 'error']);
const ACTIVE_PROGRESS_PHASES = new Set(['tool_call', 'tool_output']);
const AWAITING_PHASES = new Set(['awaiting']);
const BUSY_PHASES = new Set(['awaiting', 'streaming', 'tool_call', 'tool_output']);
const {
  findConversationViewUserDisplayRowForTurn,
} = DesktopConversationDisplayRowLookupRuntime;
const {
  normalizePendingTurn,
} = DesktopChatPendingTurnStateRuntime;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

function readExactIdentityString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function readExactLifecycleString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function normalizeConversationRef(value) {
  return readExactIdentityString(value);
}

function normalizeTurnRef(value) {
  return readExactIdentityString(value);
}

function normalizeSdkLiveTurnPhase(sdkLiveTurn) {
  return readExactLifecycleString(sdkLiveTurn?.phase);
}

function sdkLiveTurnMatchesPendingTurn(pendingTurn, sdkLiveTurn) {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn || !sdkLiveTurn) {
    return false;
  }
  return (
    normalizeConversationRef(sdkLiveTurn.conversationRef) === normalizedPendingTurn.conversationRef
    && normalizeTurnRef(sdkLiveTurn.turnRef) === normalizedPendingTurn.turnRef
  );
}

function hasVisiblePresentationContent(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    return false;
  }
  const entries = Array.isArray(presentation.entries) ? presentation.entries : [];
  return (
    entries.length > 0
    || Boolean(readExactLifecycleString(presentation.lastError))
  );
}

function hasPresentationLifecycleEvidence(presentation) {
  return Boolean(
    hasVisiblePresentationContent(presentation)
      || presentation?.isBusy === true
      || presentation?.isTerminal === true,
  );
}

function hasLegacyVisibleLiveTurnContent(sdkLiveTurn) {
  if (!sdkLiveTurn || typeof sdkLiveTurn !== 'object') {
    return false;
  }
  if (sdkLiveTurn.presentation && typeof sdkLiveTurn.presentation === 'object') {
    return false;
  }
  return Boolean(
    readExactLifecycleString(sdkLiveTurn.assistantText)
      || readExactLifecycleString(sdkLiveTurn.reasoningText)
      || readExactLifecycleString(sdkLiveTurn.lastError)
      || (Array.isArray(sdkLiveTurn.toolEvents) && sdkLiveTurn.toolEvents.length > 0),
  );
}

function hasTerminalSdkLiveTurnLifecycle(sdkLiveTurn) {
  const phase = normalizeSdkLiveTurnPhase(sdkLiveTurn);
  return Boolean(
    TERMINAL_PHASES.has(phase)
      || sdkLiveTurn?.presentation?.isTerminal === true,
  );
}

function canSdkLiveTurnReplacePendingTurn(pendingTurn, sdkLiveTurn) {
  return (
    sdkLiveTurnMatchesPendingTurn(pendingTurn, sdkLiveTurn)
    && (
      hasVisiblePresentationContent(sdkLiveTurn?.presentation)
      || hasLegacyVisibleLiveTurnContent(sdkLiveTurn)
      || hasTerminalSdkLiveTurnLifecycle(sdkLiveTurn)
    )
  );
}

function isAuthoritativeSdkLiveTurn(sdkLiveTurn) {
  if (!sdkLiveTurn) {
    return false;
  }
  const phase = normalizeSdkLiveTurnPhase(sdkLiveTurn);
  if (AWAITING_PHASES.has(phase)) {
    return true;
  }
  if (ACTIVE_PROGRESS_PHASES.has(phase) || TERMINAL_PHASES.has(phase)) {
    return true;
  }
  return (
    hasPresentationLifecycleEvidence(sdkLiveTurn.presentation)
    || hasLegacyVisibleLiveTurnContent(sdkLiveTurn)
  );
}

function hasAuthoritativeSameTurnSdkReplacement(pendingTurn, sdkLiveTurn) {
  return (
    sdkLiveTurnMatchesPendingTurn(pendingTurn, sdkLiveTurn)
    && isAuthoritativeSdkLiveTurn(sdkLiveTurn)
  );
}

function conversationViewMatchesPendingTurn(pendingTurn, conversationView) {
  if (!pendingTurn || !conversationView) {
    return false;
  }
  return (
    normalizeConversationRef(conversationView.conversationRef) === pendingTurn.conversationRef
    && normalizeTurnRef(conversationView.liveTurn?.turnRef) === pendingTurn.turnRef
  );
}

function pendingTurnBelongsToConversationView(pendingTurn, conversationView) {
  if (!pendingTurn || !conversationView) {
    return false;
  }
  return normalizeConversationRef(conversationView.conversationRef) === pendingTurn.conversationRef;
}

function getConversationViewLiveTurnRef(conversationView) {
  return (
    normalizeTurnRef(conversationView?.liveTurn?.turnRef)
    || normalizeTurnRef(conversationView?.surfaces?.responseOverlay?.turnRef)
  );
}

function hasConversationViewVisibleReplacement(conversationView, pendingTurn = null) {
  if (!conversationView || typeof conversationView !== 'object') {
    return false;
  }
  const liveTurn = conversationView.liveTurn || {};
  const entries = Array.isArray(liveTurn.entries) ? liveTurn.entries : [];
  if (
    entries.length > 0
    || liveTurn.isTerminal === true
    || TERMINAL_PHASES.has(normalizeSdkLiveTurnPhase(liveTurn))
  ) {
    return true;
  }
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  const liveTurnRef = getConversationViewLiveTurnRef(conversationView);
  return Boolean(
    normalizedPendingTurn
      && liveTurnRef === normalizedPendingTurn.turnRef
      && findConversationViewUserDisplayRowForTurn(conversationView, normalizedPendingTurn.turnRef),
  );
}

function canConversationViewReplacePendingTurn(pendingTurn, conversationView) {
  return Boolean(
    conversationViewMatchesPendingTurn(pendingTurn, conversationView)
      && hasConversationViewVisibleReplacement(conversationView, pendingTurn),
  );
}

function resolvePendingTurnForSdkLiveTurn({
  pendingTurn = null,
  sdkLiveTurn = null,
} = {}) {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return null;
  }
  return canSdkLiveTurnReplacePendingTurn(normalizedPendingTurn, sdkLiveTurn)
    ? null
    : pendingTurn;
}

function findAwaitingAnchor(pendingTurn, sdkLiveTurn) {
  const presentationAnchor = sdkLiveTurn?.presentation?.awaitingAnchor;
  if (
    presentationAnchor?.kind === 'user-message'
    && readExactIdentityString(presentationAnchor.rowId)
  ) {
    return {
      kind: 'user-message',
      rowId: presentationAnchor.rowId,
    };
  }

  const pendingMessageId = readExactIdentityString(pendingTurn?.userMessageId);
  if (pendingMessageId) {
    return {
      kind: 'user-message',
      rowId: pendingMessageId,
    };
  }

  return null;
}

function findConversationViewAwaitingAnchor(conversationView, pendingTurn) {
  const liveTurnRef = getConversationViewLiveTurnRef(conversationView);
  const userRow = findConversationViewUserDisplayRowForTurn(conversationView, liveTurnRef);
  const rowId = readExactIdentityString(userRow?.id);
  if (rowId) {
    return {
      kind: 'user-message',
      rowId,
    };
  }
  return findAwaitingAnchor(pendingTurn, null);
}

function resolveTerminalReason(sdkLiveTurn) {
  const phase = normalizeSdkLiveTurnPhase(sdkLiveTurn);
  if (phase === 'error' || readExactLifecycleString(sdkLiveTurn?.presentation?.lastError)) {
    return 'error';
  }
  if (phase === 'complete' || sdkLiveTurn?.presentation?.isTerminal === true) {
    return 'complete';
  }
  return null;
}

function resolveSdkLifecycleStatus(sdkLiveTurn) {
  if (!sdkLiveTurn) {
    return 'idle';
  }
  const phase = normalizeSdkLiveTurnPhase(sdkLiveTurn);
  if (TERMINAL_PHASES.has(phase) || sdkLiveTurn?.presentation?.isTerminal === true) {
    return 'terminal';
  }
  if (
    ACTIVE_PROGRESS_PHASES.has(phase)
    || hasVisiblePresentationContent(sdkLiveTurn.presentation)
  ) {
    return 'active';
  }
  if (AWAITING_PHASES.has(phase)) {
    return 'awaiting';
  }
  if (sdkLiveTurn?.presentation?.isBusy === true) {
    return 'active';
  }
  return 'idle';
}

function resolveConversationViewLifecycleStatus(conversationView) {
  const liveTurn = conversationView?.liveTurn;
  const responseOverlayMode = readExactLifecycleString(conversationView?.surfaces?.responseOverlay?.mode);
  if (!liveTurn && !responseOverlayMode) {
    return 'idle';
  }
  if (responseOverlayMode === 'typing' || responseOverlayMode === 'awaiting') {
    return 'awaiting';
  }
  if (responseOverlayMode === 'response') {
    return 'active';
  }
  if (liveTurn?.isTerminal === true) {
    return 'terminal';
  }
  const phase = normalizeSdkLiveTurnPhase(liveTurn);
  if (TERMINAL_PHASES.has(phase)) {
    return 'terminal';
  }
  if (
    liveTurn?.isBusy === true
    || BUSY_PHASES.has(phase)
    || hasVisiblePresentationContent(liveTurn)
  ) {
    return AWAITING_PHASES.has(phase) ? 'awaiting' : 'active';
  }
  return 'idle';
}

function resolveVisibleTurnLifecycle({
  activeConversationRef = null,
  conversationView = null,
  pendingTurn = null,
  sdkLiveTurn = null,
} = {}) {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  const normalizedActiveConversationRef = normalizeConversationRef(activeConversationRef);
  const sdkLiveTurnConversationRef = normalizeConversationRef(sdkLiveTurn?.conversationRef);
  const sdkLiveTurnRef = normalizeTurnRef(sdkLiveTurn?.turnRef);
  const effectiveConversationView = hasWorkspaceConversationView({ conversationView })
    ? conversationView
    : null;
  const effectivePendingTurn = (
    !effectiveConversationView
    || pendingTurnBelongsToConversationView(normalizedPendingTurn, effectiveConversationView)
  )
    ? normalizedPendingTurn
    : null;
  const sameTurnReplacement = hasAuthoritativeSameTurnSdkReplacement(
    effectivePendingTurn,
    sdkLiveTurn,
  );
  const viewStatus = resolveConversationViewLifecycleStatus(effectiveConversationView);
  const sameTurnConversationViewReplacement = (
    canConversationViewReplacePendingTurn(effectivePendingTurn, effectiveConversationView)
    && viewStatus !== 'idle'
  );

  if (effectivePendingTurn && !sameTurnReplacement && !sameTurnConversationViewReplacement) {
    return {
      status: 'local_pending',
      source: 'local',
      conversationRef: effectivePendingTurn.conversationRef,
      turnRef: effectivePendingTurn.turnRef,
      awaitingAnchor: findAwaitingAnchor(effectivePendingTurn, null),
      entries: [],
      terminalReason: null,
      isBusy: true,
      showTyping: true,
    };
  }

  if (effectiveConversationView && viewStatus !== 'idle') {
    const liveTurn = effectiveConversationView.liveTurn || {};
    const entries = Array.isArray(liveTurn.entries) ? liveTurn.entries : [];
    return {
      status: viewStatus,
      source: 'conversation-view',
      conversationRef: normalizeConversationRef(effectiveConversationView.conversationRef),
      turnRef: normalizeTurnRef(liveTurn.turnRef),
      awaitingAnchor: viewStatus === 'awaiting'
        ? findConversationViewAwaitingAnchor(effectiveConversationView, effectivePendingTurn)
        : null,
      entries,
      terminalReason: liveTurn.isTerminal === true ? 'complete' : null,
      isBusy: liveTurn.isBusy === true && viewStatus !== 'terminal',
      showTyping: viewStatus === 'awaiting',
    };
  }

  if (effectiveConversationView) {
    return {
      status: 'idle',
      source: 'conversation-view',
      conversationRef: normalizeConversationRef(effectiveConversationView.conversationRef) || normalizedActiveConversationRef,
      turnRef: null,
      awaitingAnchor: null,
      entries: [],
      terminalReason: null,
      isBusy: false,
      showTyping: false,
    };
  }

  const sdkStatus = sameTurnReplacement && hasLegacyVisibleLiveTurnContent(sdkLiveTurn)
    ? 'active'
    : resolveSdkLifecycleStatus(sdkLiveTurn);
  if (
    sdkLiveTurn
    && sdkStatus !== 'idle'
    && sdkLiveTurnConversationRef
    && (!normalizedActiveConversationRef || sdkLiveTurnConversationRef === normalizedActiveConversationRef)
  ) {
    const entries = Array.isArray(sdkLiveTurn.presentation?.entries)
      ? sdkLiveTurn.presentation.entries
      : [];
    return {
      status: sdkStatus,
      source: 'sdk',
      conversationRef: sdkLiveTurnConversationRef,
      turnRef: sdkLiveTurnRef,
      awaitingAnchor: sdkStatus === 'awaiting'
        ? findAwaitingAnchor(normalizedPendingTurn, sdkLiveTurn)
        : null,
      entries,
      terminalReason: resolveTerminalReason(sdkLiveTurn),
      isBusy: BUSY_PHASES.has(normalizeSdkLiveTurnPhase(sdkLiveTurn)),
      showTyping: sdkStatus === 'awaiting',
    };
  }

  return {
    status: 'idle',
    source: 'sdk',
    conversationRef: normalizedActiveConversationRef,
    turnRef: null,
    awaitingAnchor: null,
    entries: [],
    terminalReason: null,
    isBusy: false,
    showTyping: false,
  };
}

function applyVisibleTurnLifecycleToPresentationState(presentationState, visibleTurnLifecycle) {
  const nextState = {
    ...(presentationState || {}),
    visibleTurnLifecycle,
    isBusy: visibleTurnLifecycle?.isBusy === true,
  };
  if (
    visibleTurnLifecycle?.status === 'local_pending'
    || visibleTurnLifecycle?.status === 'awaiting'
  ) {
    return {
      ...nextState,
      awaitingDotTargetMessageId: visibleTurnLifecycle.awaitingAnchor?.rowId || null,
      chatboxSurfaceState: 'awaiting-reply',
    };
  }
  if (visibleTurnLifecycle?.status === 'active') {
    return {
      ...nextState,
      awaitingDotTargetMessageId: null,
    };
  }
  return {
    ...nextState,
    awaitingDotTargetMessageId: null,
  };
}

export const DesktopVisibleTurnLifecycleRuntime = Object.freeze({
  applyVisibleTurnLifecycleToPresentationState,
  resolvePendingTurnForSdkLiveTurn,
  resolveVisibleTurnLifecycle,
});
