import { useEffect, useMemo, useState } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

const ACTIVE_TURN_PHASES = new Set(['awaiting', 'streaming', 'tool_call', 'tool_output']);
const TERMINAL_TURN_PHASES = new Set(['complete', 'error', 'idle']);

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isCurrentTurnProjection(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof value.conversationRef === 'string'
      && typeof value.phase === 'string'
      && typeof value.assistantText === 'string'
      && Array.isArray(value.toolEvents),
  );
}

function hasCurrentTurnContent(currentTurn) {
  if (!isCurrentTurnProjection(currentTurn)) {
    return false;
  }
  return Boolean(
    normalizeString(currentTurn.assistantText)
      || normalizeString(currentTurn.reasoningText)
      || normalizeString(currentTurn.lastError)
      || (Array.isArray(currentTurn.toolEvents) && currentTurn.toolEvents.length > 0),
  );
}

function shouldSuppressAsAwaitingPhase(currentTurn, responseOverlayPhase) {
  return (
    responseOverlayPhase === 'awaiting-first-chunk'
    && (!currentTurn || currentTurn.phase === 'complete' || currentTurn.phase === 'error' || currentTurn.phase === 'idle')
  );
}

export function useMinimalCurrentTurn() {
  const [currentTurn, setCurrentTurn] = useState(null);
  const [responseOverlayPhase, setResponseOverlayPhase] = useState('idle');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const removeCurrentTurnListener = IpcBridge.on(ON_CHANNELS.WINDIE_CURRENT_TURN, (payload) => {
      const nextCurrentTurn = isCurrentTurnProjection(payload)
        ? payload
        : (payload && typeof payload === 'object' ? payload.currentTurn : null);
      if (isCurrentTurnProjection(nextCurrentTurn)) {
        setCurrentTurn(nextCurrentTurn);
      }
    });
    const removePhaseListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_PHASE, (payload = {}) => {
      if (typeof payload?.phase === 'string') {
        setResponseOverlayPhase(payload.phase);
      }
    });
    const removeStatusListener = IpcBridge.on(ON_CHANNELS.WINDIE_STATUS, (payload = {}) => {
      setStatus(payload && typeof payload === 'object' ? payload : null);
    });
    return () => {
      removeCurrentTurnListener?.();
      removePhaseListener?.();
      removeStatusListener?.();
    };
  }, []);

  return useMemo(() => {
    const currentPhase = normalizeString(currentTurn?.phase) || 'idle';
    const hasContent = hasCurrentTurnContent(currentTurn);
    const suppressForAwaiting = shouldSuppressAsAwaitingPhase(currentTurn, responseOverlayPhase);
    return {
      currentTurn,
      hasContent: hasContent && !suppressForAwaiting,
      isBusy: ACTIVE_TURN_PHASES.has(currentPhase),
      isTerminal: TERMINAL_TURN_PHASES.has(currentPhase),
      responseOverlayPhase,
      status,
    };
  }, [currentTurn, responseOverlayPhase, status]);
}

export function hasMinimalCurrentTurnContent(currentTurn) {
  return hasCurrentTurnContent(currentTurn);
}
