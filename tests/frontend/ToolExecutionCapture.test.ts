jest.mock('../../frontend/src/renderer/infrastructure/services/SystemCapture', () => ({
  extractOSstate: jest.fn(),
}));

import {
  captureAfterTool,
  ensureAutoCapture,
  isComputerUseTool,
  resolveSystemState,
} from '../../frontend/src/renderer/infrastructure/services/ToolExecutionCapture';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';

const mockExtractOSstate = extractOSstate as jest.MockedFunction<typeof extractOSstate>;

describe('ToolExecutionCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('isComputerUseTool detects standard tools and run_shell_command wait', () => {
    expect(isComputerUseTool('mouse_control', {})).toBe(true);
    expect(isComputerUseTool('read_file', {})).toBe(false);
    expect(isComputerUseTool('run_shell_command', { wait: 3 })).toBe(true);
    expect(isComputerUseTool('run_shell_command', { wait: 0 })).toBe(false);
  });

  test('captureAfterTool uses computed wait seconds and returns system state', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'App', mouse_position: '1,1' },
      screenshot: 'shot',
    });

    const nowSpy = jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2500);

    const result = await captureAfterTool('wait', { seconds: 3 }, true, 2);

    expect(mockExtractOSstate).toHaveBeenCalledWith(true, true, 3, false);
    expect(result.waitSeconds).toBe(3);
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '1,1' });
    expect(result.screenshot).toBe('shot');
    expect(result.captureTime).toBeCloseTo(1.5, 5);

    nowSpy.mockRestore();
  });

  test('captureAfterTool prefers args.wait and falls back to default wait', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: null,
      screenshot: 'shot',
    } as any);

    const waitArgResult = await captureAfterTool('run_shell_command', { wait: 4 }, true, 2);
    expect(mockExtractOSstate).toHaveBeenNthCalledWith(1, true, true, 4, false);
    expect(waitArgResult.waitSeconds).toBe(4);

    const defaultWaitResult = await captureAfterTool('mouse_control', {}, true, 2);
    expect(mockExtractOSstate).toHaveBeenNthCalledWith(2, true, true, 2, false);
    expect(defaultWaitResult.waitSeconds).toBe(2);
  });

  test('captureAfterTool drops system state when disabled', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'App' },
      screenshot: 'shot',
    });

    const result = await captureAfterTool('mouse_control', { action: 'click' }, false, 2);

    expect(mockExtractOSstate).toHaveBeenCalledWith(true, false, 2, false);
    expect(result.systemState).toBeNull();
    expect(result.screenshot).toBe('shot');
  });

  test('ensureAutoCapture resolves existing screenshot fields without new capture', async () => {
    const fromScreenshot = await ensureAutoCapture('read_file', {}, false, {
      success: true,
      data: {
        screenshot: 'shot-a',
        screenshot_content_type: 'image/png',
        system_state: { active_window: 'App' },
      },
    } as any);
    expect(fromScreenshot).toEqual({
      screenshot: 'shot-a',
      screenshotContentType: 'image/png',
      systemState: { active_window: 'App' },
      waitDelay: 0,
      captureTime: 0,
      isComputerTool: false,
    });

    const fromImageData = await ensureAutoCapture('read_file', {}, false, {
      success: true,
      data: {
        image_data: 'shot-b',
        compression: 'jpeg',
      },
    } as any);
    expect(fromImageData).toEqual({
      screenshot: 'shot-b',
      screenshotContentType: 'image/jpeg',
      systemState: null,
      waitDelay: 0,
      captureTime: 0,
      isComputerTool: false,
    });

    expect(mockExtractOSstate).not.toHaveBeenCalled();
  });

  test('ensureAutoCapture ignores non-string screenshot fields for non-capture tools', async () => {
    const result = await ensureAutoCapture('read_file', {}, false, {
      success: true,
      data: {
        screenshot: { invalid: true },
        image_data: 42,
        compression: 'png',
      },
    } as any);

    expect(result).toEqual({
      screenshot: null,
      screenshotContentType: 'image/png',
      systemState: null,
      waitDelay: 0,
      captureTime: 0,
      isComputerTool: false,
    });
    expect(mockExtractOSstate).not.toHaveBeenCalled();
  });

  test('resolveSystemState prefers explicit state then payload fallback', () => {
    expect(
      resolveSystemState(
        { active_window: 'Explicit' } as any,
        { system_state: { active_window: 'Fallback' } } as any
      )
    ).toEqual({ active_window: 'Explicit' });

    expect(
      resolveSystemState(
        null,
        { system_state: { active_window: 'Fallback' } } as any
      )
    ).toEqual({ active_window: 'Fallback' });

    expect(resolveSystemState(null, null)).toBeNull();
  });

  test('ensureAutoCapture keeps existing screenshot and skips capture', async () => {
    const result: any = {
      success: true,
      data: {
        screenshot: 'existing-shot',
        screenshot_content_type: 'image/png',
        system_state: { active_window: 'Existing' },
      },
    };

    const capture = await ensureAutoCapture('mouse_control', { action: 'click' }, false, result);

    expect(mockExtractOSstate).not.toHaveBeenCalled();
    expect(capture).toEqual({
      screenshot: 'existing-shot',
      screenshotContentType: 'image/png',
      systemState: { active_window: 'Existing' },
      waitDelay: 0,
      captureTime: 0,
      isComputerTool: true,
    });
  });

  test('ensureAutoCapture captures for screenshot tool and writes back to result data', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'Captured' },
      screenshot: 'captured-shot',
      screenshotContentType: 'image/jpeg',
    } as any);

    const result: any = { success: true, data: { output: 'ok' } };

    const capture = await ensureAutoCapture('screenshot', {}, false, result);

    expect(mockExtractOSstate).toHaveBeenCalledWith(true, true, 0, false);
    expect(capture.screenshot).toBe('captured-shot');
    expect(capture.screenshotContentType).toBe('image/jpeg');
    expect(result.data.screenshot).toBe('captured-shot');
    expect(result.data.screenshot_content_type).toBe('image/jpeg');
  });

  test('ensureAutoCapture respects skipAutoCapture option', async () => {
    const result: any = { success: true, data: { output: 'ok' } };

    const capture = await ensureAutoCapture('mouse_control', { action: 'click' }, true, result);

    expect(mockExtractOSstate).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeNull();
    expect(capture.screenshotContentType).toBeNull();
    expect(capture.systemState).toBeNull();
    expect(capture.isComputerTool).toBe(true);
    expect(result.data).toEqual({ output: 'ok' });
  });
});
