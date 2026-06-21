/**
 * Owns renderer-visible turn lifecycle projection for desktop surfaces.
 */

import { DesktopOverlayTurnLifecycleRuntime } from './desktopOverlayTurnLifecycleRuntime';

const {
  getActiveOverlayTurnLifecycle,
  getAwaitingOverlayTurnLifecycle,
  getIdleOverlayTurnLifecycle,
  getPreflightOverlayTurnLifecycle,
  getTerminalOverlayTurnLifecycle,
} = DesktopOverlayTurnLifecycleRuntime;

const TERMINAL_PHASES = new Set(['complete', 'error']);
const ACTIVE_PROGRESS_PHASES = new Set(['tool_call', 'tool_output']);
const AWAITING_PHASES = new Set(['awaiting']);
const BUSY_PHASES = new Set(['awaiting', 'streaming', 'tool_call', 'tool_output']);

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeConversationRef(value) {
  return normalizeString(value);
}

function normalizeTurnRef(value) {
  return normalizeString(value);
}

function normalizePendingTurn(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const conversationRef = normalizeConversationRef(value.conversationRef);
  const turnRef = normalizeTurnRef(value.turnRef);
  if (!conversationRef || !turnRef) {
    return null;
  }
  return {
    ...value,
    conversationRef,
    turnRef,
  };
}

function normalizeProjectionPhase(currentTurnProjection) {
  return normalizeString(currentTurnProjection?.phase);
}

function projectionMatchesPendingTurn(pendingTurn, currentTurnProjection) {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn || !currentTurnProjection) {
    return false;
  }
  return (
    normalizeConversationRef(currentTurnProjection.conversationRef) === normalizedPendingTurn.conversationRef
    && normalizeTurnRef(currentTurnProjection.turnRef) === normalizedPendingTurn.turnRef
  );
}

function hasVisiblePresentationContent(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    return false;
  }
  const entries = Array.isArray(presentation.entries) ? presentation.entries : [];
  return (
    presentation.hasVisibleContent === true
    || entries.length > 0
    || Boolean(normalizeString(presentation.lastError))
  );
}

function hasToolProgress(currentTurnProjection) {
  const toolEvents = Array.isArray(currentTurnProjection?.toolEvents)
    ? currentTurnProjection.toolEvents
    : [];
  return toolEvents.some((event) => (
    event?.kind === 'tool_call'
    || event?.kind === 'tool_output'
    || event?.kind === 'tool_progress'
  ));
}

function hasVisibleTextOrError(currentTurnProjection) {
  return Boolean(
    normalizeString(currentTurnProjection?.assistantText)
      || normalizeString(currentTurnProjection?.reasoningText)
      || normalizeString(currentTurnProjection?.lastError),
  );
}

function isAuthoritativeSdkProjection(currentTurnProjection) {
  if (!currentTurnProjection) {
    return false;
  }
  const phase = normalizeProjectionPhase(currentTurnProjection);
  if (AWAITING_PHASES.has(phase)) {
    return true;
  }
  if (ACTIVE_PROGRESS_PHASES.has(phase) || TERMINAL_PHASES.has(phase)) {
    return true;
  }
  if (hasVisibleTextOrError(currentTurnProjection)) {
    return true;
  }
  if (hasToolProgress(currentTurnProjection)) {
    return true;
  }
  return hasVisiblePresentationContent(currentTurnProjection.presentation);
}

function hasAuthoritativeSameTurnSdkReplacement(pendingTurn, currentTurnProjection) {
  return (
    projectionMatchesPendingTurn(pendingTurn, currentTurnProjection)
    && isAuthoritativeSdkProjection(currentTurnProjection)
  );
}

function findAwaitingAnchor(messages, pendingTurn, currentTurnProjection) {
  const presentationAnchor = currentTurnProjection?.presentation?.awaitingAnchor;
  if (
    presentationAnchor?.kind === 'user-message'
    && normalizeString(presentationAnchor.rowId)
  ) {
    return {
      kind: 'user-message',
      rowId: presentationAnchor.rowId.trim(),
    };
  }

  const pendingMessageId = normalizeString(pendingTurn?.userMessageId);
  if (pendingMessageId) {
    return {
      kind: 'user-message',
      rowId: pendingMessageId,
    };
  }

  if (!Array.isArray(messages)) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sender === 'user' && normalizeString(message.id)) {
      return {
        kind: 'user-message',
        rowId: message.id.trim(),
      };
    }
  }
  return null;
}

function resolveTerminalReason(currentTurnProjection) {
  const phase = normalizeProjectionPhase(currentTurnProjection);
  if (phase === 'error' || normalizeString(currentTurnProjection?.lastError)) {
    return 'error';
  }
  if (phase === 'complete' || currentTurnProjection?.presentation?.isTerminal === true) {
    return 'complete';
  }
  return null;
}

function resolveSdkLifecycleStatus(currentTurnProjection) {
  if (!currentTurnProjection) {
    return 'idle';
  }
  const phase = normalizeProjectionPhase(currentTurnProjection);
  if (TERMINAL_PHASES.has(phase) || currentTurnProjection?.presentation?.isTerminal === true) {
    return 'terminal';
  }
  if (
    ACTIVE_PROGRESS_PHASES.has(phase)
    || hasVisibleTextOrError(currentTurnProjection)
    || hasToolProgress(currentTurnProjection)
    || hasVisiblePresentationContent(currentTurnProjection.presentation)
  ) {
    return 'active';
  }
  if (AWAITING_PHASES.has(phase)) {
    return 'awaiting';
  }
  return 'idle';
}

function resolveVisibleTurnLifecycle({
  activeConversationRef = null,
  pendingTurn = null,
  currentTurnProjection = null,
  messages = [],
} = {}) {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  const normalizedActiveConversationRef = normalizeConversationRef(activeConversationRef);
  const projectionConversationRef = normalizeConversationRef(currentTurnProjection?.conversationRef);
  const projectionTurnRef = normalizeTurnRef(currentTurnProjection?.turnRef);
  const sameTurnReplacement = hasAuthoritativeSameTurnSdkReplacement(
    normalizedPendingTurn,
    currentTurnProjection,
  );

  if (normalizedPendingTurn && !sameTurnReplacement) {
    return {
      status: 'local_pending',
      source: 'local',
      conversationRef: normalizedPendingTurn.conversationRef,
      turnRef: normalizedPendingTurn.turnRef,
      awaitingAnchor: findAwaitingAnchor(messages, normalizedPendingTurn, null),
      entries: [],
      terminalReason: null,
      isBusy: true,
      showTyping: true,
    };
  }

  const sdkStatus = resolveSdkLifecycleStatus(currentTurnProjection);
  if (
    currentTurnProjection
    && sdkStatus !== 'idle'
    && (!normalizedActiveConversationRef || projectionConversationRef === normalizedActiveConversationRef)
  ) {
    const entries = Array.isArray(currentTurnProjection.presentation?.entries)
      ? currentTurnProjection.presentation.entries
      : [];
    return {
      status: sdkStatus,
      source: 'sdk',
      conversationRef: projectionConversationRef,
      turnRef: projectionTurnRef,
      awaitingAnchor: sdkStatus === 'awaiting'
        ? findAwaitingAnchor(messages, normalizedPendingTurn, currentTurnProjection)
        : null,
      entries,
      terminalReason: resolveTerminalReason(currentTurnProjection),
      isBusy: BUSY_PHASES.has(normalizeProjectionPhase(currentTurnProjection)),
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

function shouldUseLocalSendPreflight({
  currentTurnProjection = null,
  pendingTurn = null,
} = {}) {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return false;
  }
  if (!currentTurnProjection) {
    return true;
  }
  return !hasAuthoritativeSameTurnSdkReplacement(normalizedPendingTurn, currentTurnProjection);
}

function resolveVisibleTurnLifecycleForPresentation({
  visibleTurnLifecycle,
} = {}) {
  return visibleTurnLifecycle;
}

function resolveOverlayTurnLifecycleForVisibleLifecycle(visibleTurnLifecycle) {
  if (visibleTurnLifecycle?.status === 'local_pending') {
    return getPreflightOverlayTurnLifecycle();
  }
  if (visibleTurnLifecycle?.status === 'awaiting') {
    return getAwaitingOverlayTurnLifecycle();
  }
  if (visibleTurnLifecycle?.status === 'active') {
    return getActiveOverlayTurnLifecycle();
  }
  if (visibleTurnLifecycle?.status === 'terminal') {
    return getTerminalOverlayTurnLifecycle();
  }
  return getIdleOverlayTurnLifecycle();
}

function applyVisibleTurnLifecycleToPresentationState(presentationState, visibleTurnLifecycle) {
  const nextState = {
    ...presentationState,
    visibleTurnLifecycle,
    overlayTurnLifecycle: resolveOverlayTurnLifecycleForVisibleLifecycle(visibleTurnLifecycle),
    isBusy: visibleTurnLifecycle?.isBusy === true,
  };
  if (
    visibleTurnLifecycle?.status === 'local_pending'
    || visibleTurnLifecycle?.status === 'awaiting'
  ) {
    return {
      ...nextState,
      loopUiState: 'awaiting-reply',
      isAwaitingReply: true,
      showAssistantAwaitingDot: true,
      awaitingDotTargetMessageId: visibleTurnLifecycle.awaitingAnchor?.rowId || null,
      chatboxSurfaceState: 'awaiting-reply',
      showChatboxAwaitingReply: true,
      showChatboxResponse: false,
    };
  }
  if (visibleTurnLifecycle?.status === 'active') {
    return {
      ...nextState,
      isAwaitingReply: false,
      showAssistantAwaitingDot: false,
      awaitingDotTargetMessageId: null,
      showChatboxAwaitingReply: false,
    };
  }
  return {
    ...nextState,
    isAwaitingReply: false,
    showAssistantAwaitingDot: false,
    awaitingDotTargetMessageId: null,
    showChatboxAwaitingReply: false,
  };
}

export const DesktopVisibleTurnLifecycleRuntime = Object.freeze({
  applyVisibleTurnLifecycleToPresentationState,
  hasAuthoritativeSdkProjection: isAuthoritativeSdkProjection,
  hasAuthoritativeSameTurnSdkReplacement,
  resolveVisibleTurnLifecycleForPresentation,
  resolveVisibleTurnLifecycle,
  shouldUseLocalSendPreflight,
});
