import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  __resetSystemCaptureStateForTests,
  extractOSstate,
} from '../../frontend/src/renderer/infrastructure/services/SystemCapture';

const DISPLAY_BOUNDS_STORAGE_KEY = 'desktop-assistant-display-bounds';

type MockInvokeOptions = {
  systemStateResults?: Array<unknown>;
  screenshotResults?: Array<unknown>;
};

function nextQueuedValueOrDefault(queue: Array<unknown>, defaultValue: unknown): unknown {
  if (queue.length === 0) {
    return defaultValue;
  }
  const nextValue = queue.shift();
  if (nextValue instanceof Error) {
    throw nextValue;
  }
  return nextValue;
}

function mockInvokeForCapture(options: MockInvokeOptions = {}): jest.SpyInstance {
  const systemStateQueue = [...(options.systemStateResults || [])];
  const screenshotQueue = [...(options.screenshotResults || [])];

  return jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: string) => {
    if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
      return { success: true, data: { canVerifyExternalFocus: false } };
    }
    if (channel === INVOKE_CHANNELS.SHOW_CHATBOX || channel === INVOKE_CHANNELS.HIDE_CHATBOX) {
      return { success: true };
    }
    if (channel === INVOKE_CHANNELS.GET_SYSTEM_STATE) {
      return nextQueuedValueOrDefault(systemStateQueue, {
        active_window: 'App',
        mouse_position: '0,0',
      });
    }
    if (channel === INVOKE_CHANNELS.EXECUTE_TOOL) {
      return nextQueuedValueOrDefault(screenshotQueue, {
        success: true,
        data: { screenshot: 'shot' },
      });
    }
    return { success: true };
  });
}

describe('SystemCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    __resetSystemCaptureStateForTests();
  });

  test('extractOSstate returns system state and screenshot for first user message', async () => {
    const invokeSpy = mockInvokeForCapture({
      systemStateResults: [{ active_window: 'App', mouse_position: '0,0' }],
      screenshotResults: [{ success: true, data: { screenshot: 'shot' } }],
    });

    const result = await extractOSstate(true, true, 0, true);

    expect(invokeSpy).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.SHOW_CHATBOX, {
      focus: false,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.HIDE_CHATBOX);
    expect(invokeSpy).toHaveBeenNthCalledWith(3, INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs: 120,
      skipDemotion: true,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(4, INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position', 'screen_resolution', 'windows'],
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(5, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Initial user message screenshot',
        expectation: 'Current screen state',
      },
      skipAutoCapture: false,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(6, INVOKE_CHANNELS.SHOW_CHATBOX, {
      focus: false,
    });
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '0,0' });
    expect(result.screenshot).toBe('shot');
  });

  test('extractOSstate waits before capture when wait is positive', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const invokeSpy = mockInvokeForCapture({
      systemStateResults: [{ active_window: 'App', mouse_position: '0,0' }],
      screenshotResults: [{ success: true, data: { screenshot: 'shot' } }],
    });

    const pending = extractOSstate(true, true, 0.25, false);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 250);

    jest.runAllTimers();
    const result = await pending;

    expect(result).toEqual({
      systemState: { active_window: 'App', mouse_position: '0,0' },
      screenshot: 'shot',
      screenshotContentType: null,
      screenshotId: null,
      captureMeta: null,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.HIDE_CHATBOX);
    expect(invokeSpy).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.SHOW_CHATBOX, {
      focus: false,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(3, INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs: 120,
      skipDemotion: true,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(6, INVOKE_CHANNELS.SHOW_CHATBOX, {
      focus: false,
    });
    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  test('extractOSstate includes stored display bounds in screenshot args', async () => {
    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 10, y: 20, width: 300, height: 200 }),
    );
    const invokeSpy = mockInvokeForCapture({
      systemStateResults: [{ active_window: 'App', mouse_position: '0,0' }],
      screenshotResults: [{ success: true, data: { screenshot: 'shot' } }],
    });

    await extractOSstate(true, true, 0, true);

    expect(invokeSpy).toHaveBeenNthCalledWith(5, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Initial user message screenshot',
        expectation: 'Current screen state',
        display_bounds: { x: 10, y: 20, width: 300, height: 200 },
      },
      skipAutoCapture: false,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(6, INVOKE_CHANNELS.SHOW_CHATBOX, {
      focus: false,
    });
  });

  test('extractOSstate handles system-state-only capture', async () => {
    const invokeSpy = mockInvokeForCapture({
      systemStateResults: [{ active_window: 'App', mouse_position: '1,1' }],
    });

    const result = await extractOSstate(false, true, 0, false);

    expect(invokeSpy).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs: 120,
      skipDemotion: true,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position', 'screen_resolution'],
    });
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '1,1' });
    expect(result.screenshot).toBeNull();
  });

  test('extractOSstate captures screenshot only when system state disabled', async () => {
    const invokeSpy = mockInvokeForCapture({
      screenshotResults: [{ success: true, data: { screenshot: 'shot' } }],
    });

    const result = await extractOSstate(true, false, 0, false);

    expect(invokeSpy).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.SHOW_CHATBOX, {
      focus: false,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.HIDE_CHATBOX);
    expect(invokeSpy).toHaveBeenNthCalledWith(3, INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs: 120,
      skipDemotion: true,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(4, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Screenshot capture',
        expectation: 'Current screen state',
      },
      skipAutoCapture: false,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(5, INVOKE_CHANNELS.SHOW_CHATBOX, {
      focus: false,
    });
    expect(invokeSpy).toHaveBeenCalledTimes(5);
    expect(result.systemState).toBeNull();
    expect(result.screenshot).toBe('shot');
  });

  test('extractOSstate resolves screenshot content types from compression/format fields', async () => {
    const invokeSpy = mockInvokeForCapture({
      screenshotResults: [
        { success: true, data: { screenshot: 'png-shot', compression: 'png' } },
        { success: true, data: { screenshot: 'jpg-shot', format: 'jpg' } },
      ],
    });

    const pngResult = await extractOSstate(true, false, 0, false);
    const jpgResult = await extractOSstate(true, false, 0, false);

    expect(invokeSpy).toHaveBeenCalledTimes(10);
    expect(pngResult).toEqual({
      systemState: null,
      screenshot: 'png-shot',
      screenshotContentType: 'image/png',
      screenshotId: null,
      captureMeta: null,
    });
    expect(jpgResult).toEqual({
      systemState: null,
      screenshot: 'jpg-shot',
      screenshotContentType: 'image/jpeg',
      screenshotId: null,
      captureMeta: null,
    });
  });

  test('extractOSstate extracts screenshot grounding metadata when available', async () => {
    mockInvokeForCapture({
      screenshotResults: [{
        success: true,
        data: {
          screenshot: 'shot',
          screenshot_id: 'shot-abc',
          capture_meta: { source_w: 1920, source_h: 1080, crop_x: 0, crop_y: 0, crop_w: 1920, crop_h: 1080 },
        },
      }],
    });

    const result = await extractOSstate(true, false, 0, false);

    expect(result).toEqual({
      systemState: null,
      screenshot: 'shot',
      screenshotContentType: null,
      screenshotId: 'shot-abc',
      captureMeta: { source_w: 1920, source_h: 1080, crop_x: 0, crop_y: 0, crop_w: 1920, crop_h: 1080 },
    });
  });

  test('extractOSstate ignores non-string screenshot payloads', async () => {
    const invokeSpy = mockInvokeForCapture({
      screenshotResults: [{
        success: true,
        data: { screenshot: { raw: 'not-supported' }, compression: 'png' },
      }],
    });

    const result = await extractOSstate(true, false, 0, false);

    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: 'image/png',
      screenshotId: null,
      captureMeta: null,
    });
  });

  test('extractOSstate returns null screenshot fields for unsuccessful tool payloads', async () => {
    const invokeSpy = mockInvokeForCapture({
      screenshotResults: [{
        success: false,
        data: null,
      }],
    });

    const result = await extractOSstate(true, false, 0, false);

    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: null,
      screenshotId: null,
      captureMeta: null,
    });
  });

  test('extractOSstate returns nulls when both capture modes disabled', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({} as any);

    const result = await extractOSstate(false, false, 0, false);

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: null,
      screenshotId: null,
      captureMeta: null,
    });
  });

  test('extractOSstate uses default non-first-message mode when fourth arg is omitted', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({} as any);

    const result = await extractOSstate(false, false, 0);

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: null,
      screenshotId: null,
      captureMeta: null,
    });
  });

  test('extractOSstate first-message path supports disabled screenshot/system-state flags', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({} as any);

    const result = await extractOSstate(false, false, 0, true);

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: null,
      screenshotId: null,
      captureMeta: null,
    });
  });

  test('extractOSstate handles invoke errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'invoke').mockRejectedValue(new Error('boom'));

    const result = await extractOSstate(true, true, 0, false);

    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: null,
      screenshotId: null,
      captureMeta: null,
    });
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('extractOSstate handles first-message extraction errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invokeSpy = mockInvokeForCapture({
      systemStateResults: [{ active_window: 'App', mouse_position: '0,0' }],
      screenshotResults: [new Error('first-message-screenshot-failure')],
    });

    const result = await extractOSstate(true, true, 0, true);

    expect(result).toEqual({
      systemState: null,
      screenshot: null,
      screenshotContentType: null,
      screenshotId: null,
      captureMeta: null,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });
});
