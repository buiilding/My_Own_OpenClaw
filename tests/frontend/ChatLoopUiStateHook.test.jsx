import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useChatLoopTransportState } from '../../frontend/src/renderer/features/chat/hooks/useChatLoopUiState';
import { resolveChatLoopUiState } from '../../frontend/src/renderer/features/chat/utils/state/chatLoopUiState';
import { resolveOverlayTurnLifecycle } from '../../frontend/src/renderer/features/chat/utils/state/overlayTurnLifecycleState';

const mockListeners = new Map();
const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
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
  phase = 'idle',
  isSending = false,
  hasVisibleReply = false,
  recoveryWatchdogMs = 60,
}) {
  const optimisticLifecycle = resolveOverlayTurnLifecycle({
    phase,
    isSending,
    hasVisibleReply,
  });
  const optimisticLoopUiState = resolveChatLoopUiState({
    lifecycle: optimisticLifecycle,
    hasVisibleReply,
  });
  const transportState = useChatLoopTransportState({
    snapshotSignature: `${phase || 'idle'}|${isSending ? '1' : '0'}|${hasVisibleReply ? '1' : '0'}`,
    isBusy: optimisticLoopUiState !== 'idle',
    recoveryWatchdogMs,
  });
  const lifecycle = resolveOverlayTurnLifecycle({
    phase,
    isSending,
    hasVisibleReply,
    transportConnected: transportState.isPresentationTransportConnected,
  });
  const loopUiState = resolveChatLoopUiState({
    lifecycle,
    hasVisibleReply,
  });
  const {
    isTransportConnected,
  } = transportState;

  return (
    <div
      data-testid="loop-state-probe"
      data-loop-ui-state={loopUiState}
      data-is-busy={loopUiState !== 'idle' ? '1' : '0'}
      data-is-awaiting-reply={loopUiState === 'awaiting-reply' ? '1' : '0'}
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

  test('drops to idle when backend transport disconnects during an active loop', () => {
    render(<LoopStateProbe phase="tool-call" isSending={false} />);

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('awaiting-reply');

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
    });

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('idle');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('0');
  });

  test('watchdog clears stale busy lock after reconnect when no progress arrives', async () => {
    jest.useFakeTimers();
    const { rerender } = render(<LoopStateProbe phase="awaiting-first-chunk" isSending />);

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
    });
    rerender(<LoopStateProbe phase="awaiting-first-chunk" isSending />);
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
    const { rerender } = render(<LoopStateProbe phase="awaiting-first-chunk" isSending />);

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
      mockListeners.get('ipc-status')?.({ isConnected: true });
    });

    rerender(<LoopStateProbe phase="streaming" isSending={false} hasVisibleReply />);

    act(() => {
      jest.advanceTimersByTime(75);
    });

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('active-response');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('1');
  });

  test('maps tool-output before first visible reply to awaiting state, then switches to response once content appears', () => {
    const { rerender } = render(
      <LoopStateProbe phase="tool-output" isSending={false} hasVisibleReply={false} />,
    );

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('awaiting-reply');

    rerender(<LoopStateProbe phase="streaming" isSending={false} hasVisibleReply />);
    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('active-response');
  });

  test('keeps terminal complete state in awaiting reply when a new send is already staged', () => {
    render(<LoopStateProbe phase="complete" isSending hasVisibleReply={false} />);

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('awaiting-reply');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('1');
  });

  test('keeps terminal complete state idle when stale send latch still has a visible reply', () => {
    render(<LoopStateProbe phase="complete" isSending hasVisibleReply />);

    expect(screen.getByTestId('loop-state-probe').dataset.loopUiState).toBe('idle');
    expect(screen.getByTestId('loop-state-probe').dataset.isBusy).toBe('0');
  });

  test('keeps watchdog disarmed when reconnect settles on terminal state with duplicate terminal snapshots', async () => {
    jest.useFakeTimers();
    const { rerender } = render(<LoopStateProbe phase="awaiting-first-chunk" isSending />);

    act(() => {
      mockListeners.get('ipc-status')?.({ isConnected: false });
      mockListeners.get('ipc-status')?.({ isConnected: true });
    });

    rerender(<LoopStateProbe phase="complete" isSending={false} hasVisibleReply={false} />);
    rerender(<LoopStateProbe phase="complete" isSending={false} hasVisibleReply={false} />);
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
