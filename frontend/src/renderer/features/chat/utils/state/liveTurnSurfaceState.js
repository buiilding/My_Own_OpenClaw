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

function shouldUseSendLatchOverTerminalProjection({
  currentTurnProjection,
  isSending,
  messages,
}) {
  if (isSending !== true) {
    return false;
  }
  const projectionPhase = normalizePhase(currentTurnProjection?.phase);
  if (!CURRENT_TURN_TERMINAL_PHASES.has(projectionPhase)) {
    return false;
  }
  const latestUserTurnRef = findLatestUserTurnRef(messages);
  const projectionTurnRef = normalizeTurnRef(currentTurnProjection?.turnRef);
  return Boolean(latestUserTurnRef && projectionTurnRef && latestUserTurnRef !== projectionTurnRef);
}

export function resolveLiveTurnPresentationInput({
  currentTurnProjection = null,
  isSending = false,
  messages = [],
} = {}) {
  const currentTurnPhase = mapCurrentTurnProjectionPhase(currentTurnProjection?.phase);
  if (currentTurnPhase) {
    if (shouldUseSendLatchOverTerminalProjection({
      currentTurnProjection,
      isSending,
      messages,
    })) {
      return {
        phase: RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
        isSending: true,
        source: 'send-latch',
      };
    }
    return {
      phase: currentTurnPhase,
      isSending: isCurrentTurnProjectionBusy(currentTurnProjection?.phase),
      source: 'current-turn',
    };
  }

  if (isSending === true) {
    return {
      phase: RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
      isSending: true,
      source: 'send-latch',
    };
  }

  return {
    phase: RESPONSE_OVERLAY_PHASE.IDLE,
    isSending: false,
    source: 'idle',
  };
}
