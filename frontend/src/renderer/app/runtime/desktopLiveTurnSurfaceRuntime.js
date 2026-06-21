/**
 * Resolves live current-turn surface state for renderer desktop UI surfaces.
 */

import { DesktopResponseOverlayPhaseRuntime } from './desktopResponseOverlayPhaseRuntime';

const {
  getAwaitingFirstChunkResponseOverlayPhase,
  getCompleteResponseOverlayPhase,
  getErrorResponseOverlayPhase,
  getIdleResponseOverlayPhase,
  getResponseOverlayPreflightGuardRef,
  getStreamingResponseOverlayPhase,
  getToolCallResponseOverlayPhase,
  getToolOutputResponseOverlayPhase,
  isAwaitingFirstChunkResponseOverlayPhase,
  isStreamingResponseOverlayPhase,
} = DesktopResponseOverlayPhaseRuntime;

const CURRENT_TURN_PHASE_TO_SURFACE_PHASE = Object.freeze({
  awaiting: getAwaitingFirstChunkResponseOverlayPhase(),
  streaming: getStreamingResponseOverlayPhase(),
  tool_call: getToolCallResponseOverlayPhase(),
  tool_output: getToolOutputResponseOverlayPhase(),
  complete: getCompleteResponseOverlayPhase(),
  error: getErrorResponseOverlayPhase(),
  idle: getIdleResponseOverlayPhase(),
});

const CURRENT_TURN_BUSY_PHASES = new Set([
  'awaiting',
  'streaming',
  'tool_call',
  'tool_output',
]);

const CURRENT_TURN_TERMINAL_PHASES = new Set([
  'complete',
  'error',
  'idle',
]);

function normalizePhase(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTurnRef(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function findLatestUserTurnRef(messages) {
  if (!Array.isArray(messages)) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sender !== 'user') {
      continue;
    }
    const turnRef = normalizeTurnRef(message.turnRef);
    if (turnRef) {
      return turnRef;
    }
  }
  return null;
}

function normalizeConversationRef(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isPendingTurn(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && normalizeConversationRef(value.conversationRef)
      && normalizeTurnRef(value.turnRef)
      && typeof value.userMessageId === 'string'
      && typeof value.text === 'string',
  );
}

function mapCurrentTurnProjectionPhase(phase) {
  return CURRENT_TURN_PHASE_TO_SURFACE_PHASE[normalizePhase(phase)] ?? null;
}

function isCurrentTurnProjectionBusy(phase) {
  return CURRENT_TURN_BUSY_PHASES.has(normalizePhase(phase));
}

function hasSdkLiveTurnPresentation(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && typeof presentation.typingVisible === 'boolean'
      && typeof presentation.overlayVisible === 'boolean',
  );
}

function isHiddenSdkLiveTurnPresentation(presentation) {
  if (!presentation || typeof presentation !== 'object') {
    return false;
  }
  const overlayIntent = presentation.overlayIntent;
  const entries = Array.isArray(presentation.entries) ? presentation.entries : [];
  return (
    presentation.isBusy !== true
    && presentation.typingVisible !== true
    && presentation.overlayVisible !== true
    && presentation.hasVisibleContent !== true
    && entries.length === 0
    && (
      !overlayIntent
      || overlayIntent.mode === 'hidden'
      || overlayIntent.visible === false
    )
  );
}

function resolveSdkOverlayIntent(presentation, currentTurnProjection) {
  const intent = presentation?.overlayIntent;
  if (
    intent
    && typeof intent === 'object'
    && (intent.mode === 'hidden' || intent.mode === 'awaiting' || intent.mode === 'response')
  ) {
    return intent;
  }
  const mode = presentation?.overlayVisible
    ? 'response'
    : (presentation?.typingVisible ? 'awaiting' : 'hidden');
  return {
    visible: mode !== 'hidden',
    mode,
    turnRef: currentTurnProjection?.turnRef ?? null,
    conversationRef: currentTurnProjection?.conversationRef ?? '',
    staleGuardRef: currentTurnProjection?.turnRef ?? null,
  };
}

function doesProjectionMatchPendingTurn(currentTurnProjection, pendingTurn) {
  if (!isPendingTurn(pendingTurn) || !currentTurnProjection) {
    return false;
  }
  return (
    normalizeConversationRef(currentTurnProjection.conversationRef) === pendingTurn.conversationRef
    && normalizeTurnRef(currentTurnProjection.turnRef) === pendingTurn.turnRef
  );
}

function hasSdkPresentationContent(presentation) {
  const entries = Array.isArray(presentation?.entries) ? presentation.entries : [];
  return (
    presentation?.hasVisibleContent === true
    || entries.length > 0
  );
}

function canSdkProjectionSupersedePendingTurn(currentTurnProjection, pendingTurn) {
  if (!doesProjectionMatchPendingTurn(currentTurnProjection, pendingTurn)) {
    return false;
  }
  const projectionPhase = normalizePhase(currentTurnProjection?.phase);
  const presentation = currentTurnProjection?.presentation;
  const overlayIntent = resolveSdkOverlayIntent(presentation, currentTurnProjection);
  return (
    projectionPhase === 'complete'
    || projectionPhase === 'error'
    || projectionPhase === 'streaming'
    || projectionPhase === 'tool_call'
    || projectionPhase === 'tool_output'
    || presentation?.isTerminal === true
    || presentation?.typingVisible === true
    || overlayIntent.mode === 'awaiting'
    || hasSdkPresentationContent(presentation)
  );
}

function shouldUseSendPreflight({
  currentTurnProjection,
  isSending,
  messages,
  pendingTurn,
  useSdkLiveTurnPresentation,
}) {
  if (!isPendingTurn(pendingTurn) && isSending !== true) {
    return false;
  }
  if (!currentTurnProjection) {
    return true;
  }
  if (
    isPendingTurn(pendingTurn)
    && !canSdkProjectionSupersedePendingTurn(currentTurnProjection, pendingTurn)
  ) {
    return true;
  }
  if (
    useSdkLiveTurnPresentation
    && !isHiddenSdkLiveTurnPresentation(currentTurnProjection.presentation)
  ) {
    return false;
  }
  if (
    useSdkLiveTurnPresentation
    && isHiddenSdkLiveTurnPresentation(currentTurnProjection.presentation)
  ) {
    const projectionPhase = normalizePhase(currentTurnProjection?.phase);
    const projectionTurnRef = normalizeTurnRef(currentTurnProjection?.turnRef);
    const latestUserTurnRef = findLatestUserTurnRef(messages);
    const isTerminalProjection = (
      CURRENT_TURN_TERMINAL_PHASES.has(projectionPhase)
      || currentTurnProjection.presentation?.isTerminal === true
    );
    if (
      isTerminalProjection
      && projectionTurnRef
      && latestUserTurnRef
      && projectionTurnRef === latestUserTurnRef
    ) {
      return false;
    }
    return true;
  }
  const projectionPhase = normalizePhase(currentTurnProjection?.phase);
  if (CURRENT_TURN_TERMINAL_PHASES.has(projectionPhase)) {
    return true;
  }
  return !mapCurrentTurnProjectionPhase(projectionPhase);
}

function resolveLiveTurnPresentationInput({
  currentTurnProjection = null,
  pendingTurn = null,
  isSending = false,
  messages = [],
} = {}) {
  const useSdkLiveTurnPresentation = hasSdkLiveTurnPresentation(currentTurnProjection);
  const useLocalSendLatch = shouldUseSendPreflight({
    currentTurnProjection,
    isSending,
    messages,
    pendingTurn,
    useSdkLiveTurnPresentation,
  });
  if (useLocalSendLatch) {
    const turnRef = normalizeTurnRef(pendingTurn?.turnRef) || findLatestUserTurnRef(messages);
    const preflightGuardRef = getResponseOverlayPreflightGuardRef();
    const conversationRef = (
      normalizeConversationRef(pendingTurn?.conversationRef)
      || currentTurnProjection?.conversationRef
      || null
    );
    return {
      phase: getAwaitingFirstChunkResponseOverlayPhase(),
      isSending: true,
      isBusy: true,
      showAwaiting: true,
      showResponse: false,
      source: isPendingTurn(pendingTurn) ? 'pending-turn' : 'send-preflight',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation,
      overlayIntent: {
        visible: true,
        mode: 'awaiting',
        turnRef,
        conversationRef,
        staleGuardRef: preflightGuardRef,
      },
      entries: [],
      turnRef,
      conversationRef,
      guardRef: preflightGuardRef,
    };
  }

  if (useSdkLiveTurnPresentation) {
    const presentation = currentTurnProjection.presentation;
    const overlayIntent = resolveSdkOverlayIntent(presentation, currentTurnProjection);
    const showAwaiting = overlayIntent.mode === 'awaiting';
    const showResponse = overlayIntent.mode === 'response';
    return {
      phase: mapCurrentTurnProjectionPhase(currentTurnProjection?.phase) || getIdleResponseOverlayPhase(),
      isSending: presentation.isBusy === true,
      isBusy: presentation.isBusy === true,
      showAwaiting,
      showResponse,
      source: 'sdk-current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: true,
      overlayIntent,
      entries: Array.isArray(presentation.entries) ? presentation.entries : [],
      turnRef: overlayIntent.turnRef || currentTurnProjection?.turnRef || null,
      conversationRef: overlayIntent.conversationRef || currentTurnProjection?.conversationRef || null,
      guardRef: overlayIntent.staleGuardRef || overlayIntent.turnRef || currentTurnProjection?.turnRef || null,
    };
  }

  const currentTurnPhase = mapCurrentTurnProjectionPhase(currentTurnProjection?.phase);
  if (currentTurnPhase) {
    return {
      phase: currentTurnPhase,
      isSending: isCurrentTurnProjectionBusy(currentTurnProjection?.phase),
      isBusy: isCurrentTurnProjectionBusy(currentTurnProjection?.phase),
      showAwaiting: isAwaitingFirstChunkResponseOverlayPhase(currentTurnPhase),
      showResponse: isStreamingResponseOverlayPhase(currentTurnPhase),
      source: 'current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent: null,
      entries: [],
      turnRef: currentTurnProjection?.turnRef ?? null,
      conversationRef: currentTurnProjection?.conversationRef ?? null,
      guardRef: currentTurnProjection?.turnRef ?? null,
    };
  }

  return {
    phase: getIdleResponseOverlayPhase(),
    isSending: false,
    isBusy: false,
    showAwaiting: false,
    showResponse: false,
    source: 'idle',
    useLocalSendLatch: false,
    useSdkLiveTurnPresentation: false,
    overlayIntent: null,
    entries: [],
    turnRef: null,
    conversationRef: null,
    guardRef: null,
  };
}

export const DesktopLiveTurnSurfaceRuntime = Object.freeze({
  resolveLiveTurnPresentationInput,
  resolveSdkOverlayIntent,
});
