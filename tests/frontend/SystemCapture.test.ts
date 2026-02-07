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

  test('extractOSstate waits before capture when wait is positive', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    jest.spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ active_window: 'App', mouse_position: '0,0' })
      .mockResolvedValueOnce({ success: true, data: { screenshot: 'shot' } });

    const pending = extractOSstate(true, true, 0.25, false);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 250);

    jest.runAllTimers();
    const result = await pending;

    expect(result).toEqual({
      systemState: { active_window: 'App', mouse_position: '0,0' },
      screenshot: 'shot',
      screenshotContentType: null,
    });
    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
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

  test('extractOSstate resolves screenshot content types from compression/format fields', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ success: true, data: { screenshot: 'png-shot', compression: 'png' } })
      .mockResolvedValueOnce({ success: true, data: { screenshot: 'jpg-shot', format: 'jpg' } });

    const pngResult = await extractOSstate(true, false, 0, false);
    const jpgResult = await extractOSstate(true, false, 0, false);

    expect(invokeSpy).toHaveBeenCalledTimes(2);
    expect(pngResult).toEqual({
      systemState: null,
      screenshot: 'png-shot',
      screenshotContentType: 'image/png',
    });
    expect(jpgResult).toEqual({
      systemState: null,
      screenshot: 'jpg-shot',
      screenshotContentType: 'image/jpeg',
    });
  });

  test('extractOSstate ignores non-string screenshot payloads', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValueOnce({
      success: true,
      data: { screenshot: { raw: 'not-supported' }, compression: 'png' },
    });

    const result = await extractOSstate(true, false, 0, false);

    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: 'image/png',
    });
  });

  test('extractOSstate returns null screenshot fields for unsuccessful tool payloads', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValueOnce({
      success: false,
      data: null,
    });

    const result = await extractOSstate(true, false, 0, false);

    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: null,
    });
  });

  test('extractOSstate returns nulls when both capture modes disabled', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({} as any);

    const result = await extractOSstate(false, false, 0, false);

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ systemState: null, screenshot: null, screenshotContentType: null });
  });

  test('extractOSstate uses default non-first-message mode when fourth arg is omitted', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({} as any);

    const result = await extractOSstate(false, false, 0);

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ systemState: null, screenshot: null, screenshotContentType: null });
  });

  test('extractOSstate first-message path supports disabled screenshot/system-state flags', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({} as any);

    const result = await extractOSstate(false, false, 0, true);

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

  test('extractOSstate handles first-message extraction errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ active_window: 'App', mouse_position: '0,0' })
      .mockRejectedValueOnce(new Error('first-message-screenshot-failure'));

    const result = await extractOSstate(true, true, 0, true);

    expect(result).toEqual({ systemState: null, screenshot: null, screenshotContentType: null });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
