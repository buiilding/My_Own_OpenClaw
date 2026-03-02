import { useEffect, useMemo, useReducer } from 'react';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  isChatLoopAwaitingReply,
  isChatLoopBusy,
  resolveChatLoopUiState,
} from '../utils/chatLoopUiState';

const CHAT_LOOP_MACHINE_EVENT = Object.freeze({
  SNAPSHOT: 'snapshot',
  IPC_STATUS: 'ipc-status',
  RECOVERY_TIMEOUT: 'recovery-timeout',
});

function buildSnapshotSignature({ phase, isSending, hasVisibleReply }) {
  return `${phase || 'idle'}|${isSending ? '1' : '0'}|${hasVisibleReply ? '1' : '0'}`;
}

function createInitialChatLoopMachineState() {
  return {
    loopUiState: 'idle',
    transportConnected: true,
    recoveryWatchdogArmed: false,
    pendingRecoveryFromDisconnect: false,
    preDisconnectSnapshotSignature: null,
    currentSnapshotSignature: null,
  };
}

function reduceChatLoopMachineState(state, event) {
  if (!event || typeof event !== 'object') {
    return state;
  }

  if (event.type === CHAT_LOOP_MACHINE_EVENT.IPC_STATUS) {
    const connected = event.connected === true;
    if (!connected) {
      return {
        ...state,
        transportConnected: false,
        loopUiState: 'idle',
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
      recoveryWatchdogArmed: true,
      pendingRecoveryFromDisconnect: false,
    };
  }

  if (event.type === CHAT_LOOP_MACHINE_EVENT.RECOVERY_TIMEOUT) {
    if (!state.recoveryWatchdogArmed) {
      return state;
    }
    return {
      ...state,
      loopUiState: 'idle',
      recoveryWatchdogArmed: false,
      preDisconnectSnapshotSignature: null,
    };
  }

  if (event.type !== CHAT_LOOP_MACHINE_EVENT.SNAPSHOT) {
    return state;
  }

  const snapshotSignature = buildSnapshotSignature({
    phase: event.phase,
    isSending: event.isSending === true,
    hasVisibleReply: event.hasVisibleReply === true,
  });
  const nextLoopUiState = resolveChatLoopUiState({
    phase: event.phase,
    isSending: event.isSending === true,
    hasVisibleReply: event.hasVisibleReply === true,
    transportConnected: state.transportConnected,
  });
  const observedProgressSinceDisconnect = (
    state.recoveryWatchdogArmed
    && typeof state.preDisconnectSnapshotSignature === 'string'
    && state.preDisconnectSnapshotSignature.length > 0
    && snapshotSignature !== state.preDisconnectSnapshotSignature
  );
  const keepRecoveryWatchdogArmed = (
    state.recoveryWatchdogArmed
    && nextLoopUiState !== 'idle'
    && !observedProgressSinceDisconnect
  );

  return {
    ...state,
    loopUiState: nextLoopUiState,
    currentSnapshotSignature: snapshotSignature,
    recoveryWatchdogArmed: keepRecoveryWatchdogArmed,
    preDisconnectSnapshotSignature: keepRecoveryWatchdogArmed
      ? state.preDisconnectSnapshotSignature
      : null,
  };
}

export function useChatLoopUiState({
  phase,
  isSending,
  hasVisibleReply = false,
  recoveryWatchdogMs = 3500,
}) {
  const [machineState, dispatch] = useReducer(
    reduceChatLoopMachineState,
    undefined,
    createInitialChatLoopMachineState,
  );

  useEffect(() => {
    dispatch({
      type: CHAT_LOOP_MACHINE_EVENT.SNAPSHOT,
      phase,
      isSending,
      hasVisibleReply,
    });
  }, [hasVisibleReply, isSending, machineState.transportConnected, phase]);

  useEffect(() => {
    if (!ON_CHANNELS?.IPC_STATUS) {
      return undefined;
    }
    const removeListener = IpcBridge.on(ON_CHANNELS.IPC_STATUS, (payload) => {
      dispatch({
        type: CHAT_LOOP_MACHINE_EVENT.IPC_STATUS,
        connected: payload?.isConnected === true,
      });
    });
    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    if (!INVOKE_CHANNELS?.GET_CLIENT_USER_ID) {
      return;
    }
    IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then((payload) => {
        dispatch({
          type: CHAT_LOOP_MACHINE_EVENT.IPC_STATUS,
          connected: payload?.isConnected === true,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!machineState.recoveryWatchdogArmed || !isChatLoopBusy(machineState.loopUiState)) {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      dispatch({ type: CHAT_LOOP_MACHINE_EVENT.RECOVERY_TIMEOUT });
    }, recoveryWatchdogMs);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [machineState.loopUiState, machineState.recoveryWatchdogArmed, recoveryWatchdogMs]);

  return useMemo(() => ({
    loopUiState: machineState.loopUiState,
    isBusy: isChatLoopBusy(machineState.loopUiState),
    isAwaitingReply: isChatLoopAwaitingReply(machineState.loopUiState),
  }), [machineState.loopUiState]);
}
