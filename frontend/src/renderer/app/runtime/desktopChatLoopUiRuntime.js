/**
 * Provides the chat loop ui state module for the renderer UI.
 */

import { DesktopOverlayTurnLifecycleRuntime } from './desktopOverlayTurnLifecycleRuntime';
import { DesktopStreamPhaseRuntime } from './desktopStreamPhaseRuntime';

const {
  isOverlayTurnLifecycleActive,
  isOverlayTurnLifecycleAwaiting,
  isOverlayTurnLifecycleIdle,
  isOverlayTurnLifecycleTerminal,
} = DesktopOverlayTurnLifecycleRuntime;
const {
  isOverlayAwaitingReplyPhase,
} = DesktopStreamPhaseRuntime;

const CHAT_LOOP_UI_STATE = Object.freeze({
  IDLE: 'idle',
  AWAITING_REPLY: 'awaiting-reply',
  ACTIVE_RESPONSE: 'active-response',
});

const CHAT_LOOP_TRANSPORT_MACHINE_EVENT = Object.freeze({
  SNAPSHOT: 'snapshot',
  IPC_STATUS: 'ipc-status',
  RECOVERY_TIMEOUT: 'recovery-timeout',
});

function createInitialChatLoopTransportMachineState() {
  return {
    transportConnected: true,
    forceIdle: false,
    recoveryWatchdogArmed: false,
    pendingRecoveryFromDisconnect: false,
    preDisconnectSnapshotSignature: null,
    currentSnapshotSignature: null,
  };
}

function createChatLoopSnapshotEvent({
  snapshotSignature,
  isBusy = false,
}) {
  return {
    type: CHAT_LOOP_TRANSPORT_MACHINE_EVENT.SNAPSHOT,
    snapshotSignature,
    isBusy,
  };
}

function createChatLoopTransportStatusEvent({ connected = false } = {}) {
  return {
    type: CHAT_LOOP_TRANSPORT_MACHINE_EVENT.IPC_STATUS,
    connected: connected === true,
  };
}

function createChatLoopRecoveryTimeoutEvent() {
  return {
    type: CHAT_LOOP_TRANSPORT_MACHINE_EVENT.RECOVERY_TIMEOUT,
  };
}

function reduceChatLoopTransportMachineState(state, event) {
  if (!event || typeof event !== 'object') {
    return state;
  }

  if (event.type === CHAT_LOOP_TRANSPORT_MACHINE_EVENT.IPC_STATUS) {
    const connected = event.connected === true;
    if (!connected) {
      return {
        ...state,
        transportConnected: false,
        forceIdle: false,
        recoveryWatchdogArmed: false,
        pendingRecoveryFromDisconnect: true,
        preDisconnectSnapshotSignature: state.currentSnapshotSignature,
      };
    }
    if (!state.pendingRecoveryFromDisconnect) {
      return {
        ...state,
        transportConnected: true,
      };
    }
    return {
      ...state,
      transportConnected: true,
      forceIdle: false,
      recoveryWatchdogArmed: true,
      pendingRecoveryFromDisconnect: false,
    };
  }

  if (event.type === CHAT_LOOP_TRANSPORT_MACHINE_EVENT.RECOVERY_TIMEOUT) {
    if (!state.recoveryWatchdogArmed) {
      return state;
    }
    return {
      ...state,
      forceIdle: true,
      recoveryWatchdogArmed: false,
      preDisconnectSnapshotSignature: null,
    };
  }

  if (event.type !== CHAT_LOOP_TRANSPORT_MACHINE_EVENT.SNAPSHOT) {
    return state;
  }

  const snapshotSignature = event.snapshotSignature;
  const observedProgressSinceDisconnect = (
    state.recoveryWatchdogArmed
    && typeof state.preDisconnectSnapshotSignature === 'string'
    && state.preDisconnectSnapshotSignature.length > 0
    && snapshotSignature !== state.preDisconnectSnapshotSignature
  );
  const keepRecoveryWatchdogArmed = (
    state.recoveryWatchdogArmed
    && event.isBusy === true
    && !observedProgressSinceDisconnect
  );
  const clearForcedIdle = (
    state.forceIdle === true
    && (
      event.isBusy !== true
      || snapshotSignature !== state.currentSnapshotSignature
    )
  );

  return {
    ...state,
    currentSnapshotSignature: snapshotSignature,
    forceIdle: clearForcedIdle ? false : state.forceIdle,
    recoveryWatchdogArmed: keepRecoveryWatchdogArmed,
    preDisconnectSnapshotSignature: keepRecoveryWatchdogArmed
      ? state.preDisconnectSnapshotSignature
      : null,
  };
}

function resolveChatLoopUiState({
  lifecycle,
  phase,
  hasVisibleReply = false,
}) {
  if (isOverlayTurnLifecycleIdle(lifecycle) || isOverlayTurnLifecycleTerminal(lifecycle)) {
    return CHAT_LOOP_UI_STATE.IDLE;
  }

  if (isOverlayTurnLifecycleAwaiting(lifecycle)) {
    return CHAT_LOOP_UI_STATE.AWAITING_REPLY;
  }

  if (isOverlayTurnLifecycleActive(lifecycle)) {
    if (isOverlayAwaitingReplyPhase(phase)) {
      return CHAT_LOOP_UI_STATE.AWAITING_REPLY;
    }
    return hasVisibleReply
      ? CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE
      : CHAT_LOOP_UI_STATE.AWAITING_REPLY;
  }

  return CHAT_LOOP_UI_STATE.IDLE;
}

function isChatLoopBusy(loopUiState) {
  return loopUiState !== CHAT_LOOP_UI_STATE.IDLE;
}

function isChatLoopAwaitingReply(loopUiState) {
  return loopUiState === CHAT_LOOP_UI_STATE.AWAITING_REPLY;
}

export const DesktopChatLoopUiRuntime = Object.freeze({
  createInitialChatLoopTransportMachineState,
  createChatLoopSnapshotEvent,
  createChatLoopTransportStatusEvent,
  createChatLoopRecoveryTimeoutEvent,
  reduceChatLoopTransportMachineState,
  resolveChatLoopUiState,
  isChatLoopBusy,
  isChatLoopAwaitingReply,
});
