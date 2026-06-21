/**
 * Provides the use chat loop ui state module for the renderer UI.
 */

import { useEffect, useMemo, useReducer } from 'react';
import { DesktopClientSessionRuntimeClient } from '../../../app/runtime/desktopClientSessionRuntimeClient';
import { DesktopChatLoopUiRuntime } from '../../../app/runtime/desktopChatLoopUiRuntime';

const {
  createChatLoopRecoveryTimeoutEvent,
  createChatLoopSnapshotEvent,
  createChatLoopTransportStatusEvent,
  createInitialChatLoopTransportMachineState,
  reduceChatLoopTransportMachineState,
} = DesktopChatLoopUiRuntime;

export function useChatLoopTransportState({
  snapshotSignature,
  isBusy = false,
  recoveryWatchdogMs = 3500,
}) {
  const [machineState, dispatch] = useReducer(
    reduceChatLoopTransportMachineState,
    undefined,
    createInitialChatLoopTransportMachineState,
  );

  useEffect(() => {
    dispatch(createChatLoopSnapshotEvent({
      snapshotSignature,
      isBusy,
    }));
  }, [isBusy, machineState.transportConnected, snapshotSignature]);

  useEffect(() => {
    const removeListener = DesktopClientSessionRuntimeClient.onObservedIpcTransportConnection((connected) => {
      dispatch(createChatLoopTransportStatusEvent({ connected }));
    });
    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    DesktopClientSessionRuntimeClient.loadObservedMainTransportConnection()
      .then((connected) => {
        if (typeof connected !== 'boolean') {
          return;
        }
        dispatch(createChatLoopTransportStatusEvent({ connected }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!machineState.recoveryWatchdogArmed || isBusy !== true) {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      dispatch(createChatLoopRecoveryTimeoutEvent());
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
