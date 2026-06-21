/**
 * Covers chat loop ui state. behavior in the frontend test suite.
 */

import { DesktopChatLoopUiRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime';

describe('desktopChatLoopUiRuntime', () => {
  const {
    createChatLoopRecoveryTimeoutEvent,
    createChatLoopSnapshotEvent,
    createChatLoopTransportStatusEvent,
    createInitialChatLoopTransportMachineState,
    reduceChatLoopTransportMachineState,
  } = DesktopChatLoopUiRuntime;

  test('transport machine drops disconnected loops and arms recovery on reconnect', () => {
    const initialState = reduceChatLoopTransportMachineState(
      createInitialChatLoopTransportMachineState(),
      createChatLoopSnapshotEvent({
        snapshotSignature: 'tool-call|0|0',
        isBusy: true,
      }),
    );

    const disconnectedState = reduceChatLoopTransportMachineState(
      initialState,
      createChatLoopTransportStatusEvent({ connected: false }),
    );
    expect(disconnectedState.transportConnected).toBe(false);
    expect(disconnectedState.pendingRecoveryFromDisconnect).toBe(true);
    expect(disconnectedState.preDisconnectSnapshotSignature).toBe('tool-call|0|0');

    const reconnectedState = reduceChatLoopTransportMachineState(
      disconnectedState,
      createChatLoopTransportStatusEvent({ connected: true }),
    );
    expect(reconnectedState.transportConnected).toBe(true);
    expect(reconnectedState.recoveryWatchdogArmed).toBe(true);
    expect(reconnectedState.pendingRecoveryFromDisconnect).toBe(false);
  });

  test('transport machine watchdog stays armed for stale busy snapshots and clears on timeout', () => {
    const armedState = {
      ...createInitialChatLoopTransportMachineState(),
      recoveryWatchdogArmed: true,
      preDisconnectSnapshotSignature: 'awaiting-first-chunk|1|0',
      currentSnapshotSignature: 'awaiting-first-chunk|1|0',
    };
    const staleBusyState = reduceChatLoopTransportMachineState(
      armedState,
      createChatLoopSnapshotEvent({
        snapshotSignature: 'awaiting-first-chunk|1|0',
        isBusy: true,
      }),
    );
    expect(staleBusyState.recoveryWatchdogArmed).toBe(true);

    const timedOutState = reduceChatLoopTransportMachineState(
      staleBusyState,
      createChatLoopRecoveryTimeoutEvent(),
    );
    expect(timedOutState.forceIdle).toBe(true);
    expect(timedOutState.recoveryWatchdogArmed).toBe(false);
    expect(timedOutState.preDisconnectSnapshotSignature).toBeNull();
  });

  test('transport machine disarms recovery when post-reconnect snapshot progresses', () => {
    const armedState = {
      ...createInitialChatLoopTransportMachineState(),
      recoveryWatchdogArmed: true,
      preDisconnectSnapshotSignature: 'awaiting-first-chunk|1|0',
      currentSnapshotSignature: 'awaiting-first-chunk|1|0',
    };

    const progressedState = reduceChatLoopTransportMachineState(
      armedState,
      createChatLoopSnapshotEvent({
        snapshotSignature: 'streaming|0|1',
        isBusy: true,
      }),
    );

    expect(progressedState.currentSnapshotSignature).toBe('streaming|0|1');
    expect(progressedState.recoveryWatchdogArmed).toBe(false);
    expect(progressedState.preDisconnectSnapshotSignature).toBeNull();
  });
});
