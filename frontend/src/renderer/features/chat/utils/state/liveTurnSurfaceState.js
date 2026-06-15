/**
 * Provides the live turn surface state module for the renderer UI.
 */

import { RESPONSE_OVERLAY_PHASE } from '../overlay/responseOverlayPhaseContract';

const CURRENT_TURN_PHASE_TO_SURFACE_PHASE = Object.freeze({
  awaiting: RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
  streaming: RESPONSE_OVERLAY_PHASE.STREAMING,
  tool_call: RESPONSE_OVERLAY_PHASE.TOOL_CALL,
  tool_output: RESPONSE_OVERLAY_PHASE.TOOL_OUTPUT,
  complete: RESPONSE_OVERLAY_PHASE.COMPLETE,
  error: RESPONSE_OVERLAY_PHASE.ERROR,
  idle: RESPONSE_OVERLAY_PHASE.IDLE,
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

export function mapCurrentTurnProjectionPhase(phase) {
  return CURRENT_TURN_PHASE_TO_SURFACE_PHASE[normalizePhase(phase)] ?? null;
}

export function isCurrentTurnProjectionBusy(phase) {
  return CURRENT_TURN_BUSY_PHASES.has(normalizePhase(phase));
}

export function hasSdkLiveTurnPresentation(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && typeof presentation.typingVisible === 'boolean'
      && typeof presentation.overlayVisible === 'boolean',
  );
}

export function isHiddenSdkLiveTurnPresentation(presentation) {
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

export function resolveSdkOverlayIntent(presentation, currentTurnProjection) {
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

function shouldUseSendPreflight({
  currentTurnProjection,
  isSending,
  messages,
  useSdkLiveTurnPresentation,
}) {
  if (isSending !== true) {
    return false;
  }
  if (!currentTurnProjection) {
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

export function resolveLiveTurnPresentationInput({
  currentTurnProjection = null,
  isSending = false,
  messages = [],
} = {}) {
  const useSdkLiveTurnPresentation = hasSdkLiveTurnPresentation(currentTurnProjection);
  const useLocalSendLatch = shouldUseSendPreflight({
    currentTurnProjection,
    isSending,
    messages,
    useSdkLiveTurnPresentation,
  });
  if (useLocalSendLatch) {
    return {
      phase: RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
      isSending: true,
      isBusy: true,
      showAwaiting: true,
      showResponse: false,
      source: 'send-preflight',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation,
      overlayIntent: null,
      entries: [],
      turnRef: findLatestUserTurnRef(messages),
      conversationRef: currentTurnProjection?.conversationRef ?? null,
      guardRef: null,
    };
  }

  if (useSdkLiveTurnPresentation) {
    const presentation = currentTurnProjection.presentation;
    const overlayIntent = resolveSdkOverlayIntent(presentation, currentTurnProjection);
    const showAwaiting = overlayIntent.mode === 'awaiting';
    const showResponse = overlayIntent.mode === 'response';
    return {
      phase: mapCurrentTurnProjectionPhase(currentTurnProjection?.phase) || RESPONSE_OVERLAY_PHASE.IDLE,
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
      showAwaiting: currentTurnPhase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
      showResponse: currentTurnPhase === RESPONSE_OVERLAY_PHASE.STREAMING,
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
    phase: RESPONSE_OVERLAY_PHASE.IDLE,
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
