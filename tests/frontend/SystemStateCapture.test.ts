jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    GET_SYSTEM_STATE: 'get-system-state',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/SurfaceOrchestrator', () => ({
  prepareExternalFocusForCapture: jest.fn().mockResolvedValue(undefined),
}));

import { captureSystemState } from '../../frontend/src/renderer/infrastructure/services/SystemStateCapture';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

describe('SystemStateCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('captures standard system state fields by default', async () => {
    mockInvoke.mockResolvedValue({
      active_window: 'App',
      mouse_position: '(0, 0)',
    } as any);

    await expect(captureSystemState()).resolves.toEqual({
      active_window: 'App',
      mouse_position: '(0, 0)',
    });
    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position', 'screen_resolution'],
    });
  });

  test('captures windows for first-session style requests and respects wait delays', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockInvoke.mockResolvedValue({
      active_window: 'App',
      mouse_position: '(1, 1)',
      windows: [],
    } as any);

    const pending = captureSystemState({
      waitSeconds: 0.25,
      includeWindows: true,
      correlationId: 'state-cap-1',
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 250);

    await jest.runAllTimersAsync();
    await expect(pending).resolves.toEqual({
      active_window: 'App',
      mouse_position: '(1, 1)',
      windows: [],
    });
    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position', 'screen_resolution', 'windows'],
    });

    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });
});
