/**
 * Covers chat loop ui state. behavior in the frontend test suite.
 */

import {
  createChatLoopRecoveryTimeoutEvent,
  createChatLoopSnapshotEvent,
  createChatLoopTransportStatusEvent,
  createInitialChatLoopTransportMachineState,
  isChatLoopAwaitingReply,
  isChatLoopBusy,
  reduceChatLoopTransportMachineState,
  resolveChatLoopUiState,
} from '../../frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime';

describe('desktopChatLoopUiRuntime', () => {
  test('treats preflight lifecycle as awaiting reply', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'preflight',
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
    expect(isChatLoopAwaitingReply(loopUiState)).toBe(true);
  });

  test('keeps streaming without a visible assistant reply in awaiting state', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'active',
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
  });

  test('switches streaming with a visible assistant reply into active response state', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'active',
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('active-response');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
    expect(isChatLoopAwaitingReply(loopUiState)).toBe(false);
  });

  test('returns to idle on terminal phases', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'terminal',
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });

  test('treats awaiting lifecycle as awaiting reply', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'awaiting',
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
  });

  test('keeps idle lifecycle idle even when a stale visible reply exists', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'idle',
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });

  test('falls back to idle for unknown lifecycle values', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'unknown',
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });

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
