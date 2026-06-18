/**
 * Provides the use chat loop ui state module for the renderer UI.
 */

import { useEffect, useMemo, useReducer } from 'react';
import { DesktopClientSessionRuntimeClient } from '../../../app/runtime/desktopClientSessionRuntimeClient';

const CHAT_LOOP_MACHINE_EVENT = Object.freeze({
  SNAPSHOT: 'snapshot',
  IPC_STATUS: 'ipc-status',
  RECOVERY_TIMEOUT: 'recovery-timeout',
});

function createInitialChatLoopMachineState() {
  return {
    transportConnected: true,
    forceIdle: false,
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

  if (event.type === CHAT_LOOP_MACHINE_EVENT.RECOVERY_TIMEOUT) {
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

  if (event.type !== CHAT_LOOP_MACHINE_EVENT.SNAPSHOT) {
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

export function useChatLoopTransportState({
  snapshotSignature,
  isBusy = false,
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
      snapshotSignature,
      isBusy,
    });
  }, [isBusy, machineState.transportConnected, snapshotSignature]);

  useEffect(() => {
    const removeListener = DesktopClientSessionRuntimeClient.onIpcStatus((payload) => {
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
    DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()
      .then((payload) => {
        if (typeof payload?.isConnected !== 'boolean') {
          return;
        }
        dispatch({
          type: CHAT_LOOP_MACHINE_EVENT.IPC_STATUS,
          connected: payload?.isConnected === true,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!machineState.recoveryWatchdogArmed || isBusy !== true) {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      dispatch({ type: CHAT_LOOP_MACHINE_EVENT.RECOVERY_TIMEOUT });
    }, recoveryWatchdogMs);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [isBusy, machineState.recoveryWatchdogArmed, recoveryWatchdogMs]);

  return useMemo(() => ({
    isTransportConnected: machineState.transportConnected,
    isPresentationTransportConnected: (
      machineState.transportConnected
      && machineState.forceIdle !== true
    ),
  }), [machineState.forceIdle, machineState.transportConnected]);
}
