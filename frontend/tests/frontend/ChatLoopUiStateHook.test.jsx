/**
 * Covers chat loop ui state hook. behavior in the frontend test suite.
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useChatLoopTransportState } from '../../src/renderer/features/chat/hooks/useChatLoopUiState';

const mockListeners = new Map();
const mockInvoke = jest.fn();

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (channel, listener) => {
      mockListeners.set(channel, listener);
      return () => {
        mockListeners.delete(channel);
      };
    },
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    GET_CLIENT_USER_ID: 'get-client-user-id',
  },
  ON_CHANNELS: {
    IPC_STATUS: 'ipc-status',
  },
}));

function LoopStateProbe({
  snapshotSignature = 'idle',
  isBusy = false,
  recoveryWatchdogMs = 60,
}) {
  const transportState = useChatLoopTransportState({
    snapshotSignature,
    isBusy,
    recoveryWatchdogMs,
  });
  const isPresentationBusy = transportState.isPresentationTransportConnected && isBusy;
  const {
    isTransportConnected,
  } = transportState;

  return (
    <div
      data-testid="loop-state-probe"
      data-loop-ui-state={isPresentationBusy ? 'busy' : 'idle'}
      data-is-busy={isPresentationBusy ? '1' : '0'}
      data-is-transport-connected={isTransportConnected ? '1' : '0'}
    />
  );
}

describe('useChatLoopUiState', () => {
  beforeEach(() => {
    mockListeners.clear();
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValue(new Error('ipc unavailable in test'));
    jest.useRealTimers();
  });

  test('drops to idle when runtime transport disconnects during an active loop', () => {
    render(<LoopStateProbe snapshotSignature="tool-call" isBusy />);

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('busy');

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
    });

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('idle');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('0');
  });

  test('ignores runtime transport status without a boolean connection state', async () => {
    mockInvoke.mockResolvedValue({ isConnected: 'yes' });

    render(<LoopStateProbe snapshotSignature="tool-call" isBusy />);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: 'unknown' });
    });

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('busy');
    expect(screen.getByTestId('loop-state-probe').dataset.isTransportConnected).toBe('1');
  });

  test('watchdog clears stale busy lock after reconnect when no progress arrives', async () => {
    jest.useFakeTimers();
    const { rerender } = render(<LoopStateProbe snapshotSignature="awaiting" isBusy />);

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
    });
    rerender(<LoopStateProbe snapshotSignature="awaiting" isBusy />);
    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: true });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('1');

    act(() => {
      jest.advanceTimersByTime(75);
    });

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('idle');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('0');
  });

  test('watchdog disarms when post-reconnect stream progress arrives', () => {
    jest.useFakeTimers();
    const { rerender } = render(<LoopStateProbe snapshotSignature="awaiting" isBusy />);

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
      mockListeners.get('ipc-status')?.({ isConnected: true });
    });

    rerender(<LoopStateProbe snapshotSignature="streaming" isBusy />);

    act(() => {
      jest.advanceTimersByTime(75);
    });

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('busy');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('1');
  });

  test('keeps watchdog disarmed when reconnect settles on terminal state with duplicate terminal snapshots', async () => {
    jest.useFakeTimers();
    const { rerender } = render(<LoopStateProbe snapshotSignature="awaiting" isBusy />);

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
      mockListeners.get('ipc-status')?.({ isConnected: true });
    });

    rerender(<LoopStateProbe snapshotSignature="complete" isBusy={false} />);
    rerender(<LoopStateProbe snapshotSignature="complete" isBusy={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('idle');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('0');
  });
});
