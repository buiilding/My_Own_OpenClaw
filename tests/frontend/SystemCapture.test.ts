import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';
import { DISPLAY_BOUNDS_STORAGE_KEY } from '../../frontend/src/renderer/utils/displaySelection';

describe('SystemCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('extractOSstate returns system state and screenshot for first user message', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ active_window: 'App', mouse_position: '0,0' })
      .mockResolvedValueOnce({ success: true, data: { screenshot: 'shot' } });

    const result = await extractOSstate(true, true, 0, true);

    expect(invokeSpy).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position', 'screen_resolution', 'windows'],
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Initial user message screenshot',
        expectation: 'Current screen state',
      },
      skipAutoCapture: false,
    });
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '0,0' });
    expect(result.screenshot).toBe('shot');
  });

  test('extractOSstate includes stored display bounds in screenshot args', async () => {
    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 10, y: 20, width: 300, height: 200 }),
    );
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ active_window: 'App', mouse_position: '0,0' })
      .mockResolvedValueOnce({ success: true, data: { screenshot: 'shot' } });

    await extractOSstate(true, true, 0, true);

    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Initial user message screenshot',
        expectation: 'Current screen state',
        display_bounds: { x: 10, y: 20, width: 300, height: 200 },
      },
      skipAutoCapture: false,
    });
  });

  test('extractOSstate handles system-state-only capture', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ active_window: 'App', mouse_position: '1,1' });

    const result = await extractOSstate(false, true, 0, false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position'],
    });
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '1,1' });
    expect(result.screenshot).toBeNull();
  });

  test('extractOSstate captures screenshot only when system state disabled', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ success: true, data: { screenshot: 'shot' } });

    const result = await extractOSstate(true, false, 0, false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Screenshot capture',
        expectation: 'Current screen state',
      },
      skipAutoCapture: false,
    });
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(result.systemState).toBeNull();
    expect(result.screenshot).toBe('shot');
  });

  test('extractOSstate returns nulls when both capture modes disabled', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({} as any);

    const result = await extractOSstate(false, false, 0, false);

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ systemState: null, screenshot: null, screenshotContentType: null });
  });

  test('extractOSstate handles invoke errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'invoke').mockRejectedValue(new Error('boom'));

    const result = await extractOSstate(true, true, 0, false);

    expect(result).toEqual({ systemState: null, screenshot: null, screenshotContentType: null });
    consoleSpy.mockRestore();
  });
});
