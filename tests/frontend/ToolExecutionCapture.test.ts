jest.mock('../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline', () => ({
  ...jest.requireActual('../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline'),
  captureScreenshotAttachment: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/SystemStateCapture', () => ({
  captureSystemState: jest.fn(),
}));

import {
  captureAfterTool,
  ensureAutoCapture,
  isComputerUseTool,
  resolveSystemState,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionCapture';
import { captureScreenshotAttachment } from '../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline';
import { captureSystemState } from '../../frontend/src/renderer/infrastructure/services/SystemStateCapture';

const mockCaptureScreenshotAttachment = captureScreenshotAttachment as jest.MockedFunction<typeof captureScreenshotAttachment>;
const mockCaptureSystemState = captureSystemState as jest.MockedFunction<typeof captureSystemState>;

describe('ToolExecutionCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: 'captured-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/jpeg',
      captureMeta: null,
    });
    mockCaptureSystemState.mockResolvedValue({
      active_window: 'Captured',
      mouse_position: '(10, 20)',
    } as any);
  });

  test('isComputerUseTool detects standard tools and run_shell_command wait', () => {
    expect(isComputerUseTool('mouse_control', {})).toBe(true);
    expect(isComputerUseTool('read_file', {})).toBe(false);
    expect(isComputerUseTool('run_shell_command', { wait: 3 })).toBe(true);
    expect(isComputerUseTool('run_shell_command', { wait: 0 })).toBe(false);
  });

  test('captureAfterTool captures screenshot first and conditionally captures system state', async () => {
    const nowSpy = jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2500);

    const result = await captureAfterTool('wait', { seconds: 3 }, true, 2, 'corr-1');

    expect(mockCaptureScreenshotAttachment).toHaveBeenCalledWith({
      waitSeconds: 3,
      correlationId: 'corr-1',
    });
    expect(mockCaptureSystemState).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'corr-1',
    });
    expect(result).toEqual({
      screenshot: 'captured-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/jpeg',
      captureMeta: null,
      systemState: { active_window: 'Captured', mouse_position: '(10, 20)' },
      waitSeconds: 3,
      captureTime: 1.5,
    });

    nowSpy.mockRestore();
  });

  test('captureAfterTool skips system state when disabled', async () => {
    const result = await captureAfterTool('mouse_control', { action: 'click' }, false, 2);

    expect(mockCaptureScreenshotAttachment.mock.calls[0][0]).toEqual({
      waitSeconds: 2,
      correlationId: undefined,
    });
    expect(mockCaptureSystemState).not.toHaveBeenCalled();
    expect(result.systemState).toBeNull();
  });

  test('ensureAutoCapture treats screenshot_ref as existing capture and fetches missing system state only', async () => {
    const result = await ensureAutoCapture('screenshot', {}, false, {
      success: true,
      data: {
        screenshot_ref: 'artifact-1',
        screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
      },
    } as any);

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockCaptureSystemState.mock.calls[0][0]).toEqual({
      waitSeconds: 0,
      correlationId: undefined,
    });
    expect(result).toEqual({
      screenshot: null,
      screenshotRef: 'artifact-1',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
      screenshotContentType: null,
      captureMeta: null,
      systemState: { active_window: 'Captured', mouse_position: '(10, 20)' },
      waitDelay: 0,
      captureTime: expect.any(Number),
      isComputerTool: true,
    });
  });

  test('ensureAutoCapture preserves existing screenshot and state without recapturing', async () => {
    const result: any = {
      success: true,
      data: {
        screenshot: 'existing-shot',
        screenshot_content_type: 'image/png',
        system_state: { active_window: 'Existing', mouse_position: '1,1' },
      },
    };

    const capture = await ensureAutoCapture('mouse_control', { action: 'click' }, false, result);

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockCaptureSystemState).not.toHaveBeenCalled();
    expect(capture).toEqual({
      screenshot: 'existing-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
      captureMeta: null,
      systemState: { active_window: 'Existing', mouse_position: '1,1' },
      waitDelay: 0,
      captureTime: 0,
      isComputerTool: true,
    });
  });

  test('ensureAutoCapture captures screenshot tool output and writes normalized fields back to result data', async () => {
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: 'captured-shot',
      screenshotRef: 'artifact-captured',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-captured',
      screenshotContentType: 'image/jpeg',
      captureMeta: { source_w: 1920, source_h: 1080 },
    });

    const result: any = { success: true, data: { output: 'ok' } };
    const capture = await ensureAutoCapture('screenshot', {}, false, result, 'req-capture');

    expect(mockCaptureScreenshotAttachment).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'req-capture',
    });
    expect(mockCaptureSystemState).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'req-capture',
    });
    expect(capture).toEqual({
      screenshot: 'captured-shot',
      screenshotRef: 'artifact-captured',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-captured',
      screenshotContentType: 'image/jpeg',
      captureMeta: { source_w: 1920, source_h: 1080 },
      systemState: { active_window: 'Captured', mouse_position: '(10, 20)' },
      waitDelay: 0,
      captureTime: expect.any(Number),
      isComputerTool: true,
    });
    expect(result.data).toMatchObject({
      output: 'ok',
      screenshot: 'captured-shot',
      screenshot_ref: 'artifact-captured',
      screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-captured',
      screenshot_content_type: 'image/jpeg',
      capture_meta: { source_w: 1920, source_h: 1080 },
      system_state: { active_window: 'Captured', mouse_position: '(10, 20)' },
    });
  });

  test('resolveSystemState prefers explicit state then payload fallback', () => {
    expect(
      resolveSystemState(
        { active_window: 'Explicit' } as any,
        { system_state: { active_window: 'Fallback' } } as any,
      ),
    ).toEqual({ active_window: 'Explicit' });

    expect(
      resolveSystemState(
        null,
        { system_state: { active_window: 'Fallback' } } as any,
      ),
    ).toEqual({ active_window: 'Fallback' });

    expect(resolveSystemState(null, null)).toBeNull();
  });
});
