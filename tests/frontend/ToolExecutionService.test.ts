jest.mock('../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline', () => ({
  ...jest.requireActual('../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline'),
  captureScreenshotAttachment: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/SystemStateCapture', () => ({
  ...jest.requireActual('../../frontend/src/renderer/infrastructure/services/SystemStateCapture'),
  captureSystemState: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/MessageFormatter', () => ({
  formatToolOutputMessage: jest.fn(() => 'formatted'),
  formatBundledToolOutputMessage: jest.fn(() => 'bundle-formatted'),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ArtifactUploader', () => ({
  uploadArtifactBase64: jest.fn().mockResolvedValue(null),
  buildArtifactUrl: (artifactId: string) => `http://127.0.0.1:8765/api/artifacts/${artifactId}`,
}));

import { ToolExecutionService } from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionService';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  formatBundledToolOutputMessage,
  formatToolOutputMessage,
} from '../../frontend/src/renderer/infrastructure/services/MessageFormatter';
import { captureScreenshotAttachment } from '../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline';
import { captureSystemState } from '../../frontend/src/renderer/infrastructure/services/SystemStateCapture';
import { uploadArtifactBase64 } from '../../frontend/src/renderer/infrastructure/services/ArtifactUploader';

const mockCaptureScreenshotAttachment = captureScreenshotAttachment as jest.MockedFunction<typeof captureScreenshotAttachment>;
const mockCaptureSystemState = captureSystemState as jest.MockedFunction<typeof captureSystemState>;
const mockFormatToolOutputMessage = formatToolOutputMessage as jest.MockedFunction<typeof formatToolOutputMessage>;
const mockFormatBundledToolOutputMessage =
  formatBundledToolOutputMessage as jest.MockedFunction<typeof formatBundledToolOutputMessage>;
const mockUploadArtifactBase64 = uploadArtifactBase64 as jest.MockedFunction<typeof uploadArtifactBase64>;

type ToolExecutionServiceOptions = NonNullable<ConstructorParameters<typeof ToolExecutionService>[0]>;

const createServiceWithSendToBackend = (
  options: Partial<ToolExecutionServiceOptions> = {},
) => {
  const sendToBackend = jest.fn();
  return {
    sendToBackend,
    service: new ToolExecutionService({ sendToBackend, ...options }),
  };
};

describe('ToolExecutionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      captureMeta: null,
    });
    mockCaptureSystemState.mockResolvedValue({
      active_window: 'App',
      mouse_position: 'Unknown',
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('executeTool captures screenshot for computer-use tools and forwards normalized payload', async () => {
    jest.useFakeTimers();
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {},
    });
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: 'shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
      captureMeta: { source_w: 1920, source_h: 1080 },
    });

    const onToolResult = jest.fn();
    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ onToolResult, sendToBackend });

    const pending = service.executeTool(
      'mouse_control',
      { action: 'click', x: 1, y: 2 },
      { correlationId: 'req-123', skipAutoCapture: false },
    );
    await jest.runAllTimersAsync();
    const result = await pending;

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'mouse_control',
      args: { action: 'click', x: 1, y: 2 },
      skipAutoCapture: false,
    });
    expect(mockCaptureScreenshotAttachment).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'req-123',
    });
    expect(mockCaptureSystemState).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'req-123',
    });
    expect(mockUploadArtifactBase64).toHaveBeenCalledWith(
      'shot',
      'image/png',
      'mouse_control-screenshot.png',
    );
    expect(result.screenshot).toBe('shot');
    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(sendToBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-result',
        payload: expect.objectContaining({
          request_id: 'req-123',
          success: true,
        }),
      }),
    );
    expect(sendToBackend.mock.calls[0][0].payload.data).toMatchObject({
      llm_content: 'formatted',
      screenshot: 'shot',
      capture_meta: { source_w: 1920, source_h: 1080 },
      system_state: {
        active_window: 'App',
        mouse_position: 'Unknown',
      },
    });
    expect(mockFormatToolOutputMessage).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('executeTool skips auto capture and strips screenshot fields for non computer-use tools', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {
        output: 'ok',
        screenshot_ref: 'should-not-be-forwarded',
      },
    });

    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ sendToBackend });
    const result = await service.executeTool(
      'read_file',
      { file_path: '/tmp/a' },
      { correlationId: 'req-no-shot', skipAutoCapture: false },
    );

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockCaptureSystemState).not.toHaveBeenCalled();
    expect(result.screenshot).toBeNull();
    expect(result.screenshotRef).toBe('should-not-be-forwarded');
    expect(sendToBackend.mock.calls[0][0].payload.data).toEqual({
      output: 'ok',
      llm_content: 'formatted',
    });
  });

  test('executeTool reuses pre-uploaded screenshot_ref from tool result and captures missing system state only', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {
        screenshot_ref: 'artifact-sidecar-1',
        screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-sidecar-1',
      },
    });

    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ sendToBackend });
    const result = await service.executeTool(
      'screenshot',
      {},
      { correlationId: 'req-sidecar-artifact', skipAutoCapture: false },
    );

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockCaptureSystemState).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'req-sidecar-artifact',
    });
    expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
    expect(result.screenshot).toBeNull();
    expect(result.screenshotRef).toBe('artifact-sidecar-1');
    expect(result.screenshotUrl).toBe('http://127.0.0.1:8765/api/artifacts/artifact-sidecar-1');
    expect(sendToBackend.mock.calls[0][0].payload.data).toMatchObject({
      llm_content: 'formatted',
      screenshot_ref: 'artifact-sidecar-1',
      system_state: {
        active_window: 'App',
        mouse_position: 'Unknown',
      },
    });
  });

  test('executeTool reuses existing screenshot and system_state from tool result', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {
        screenshot: 'shot',
        system_state: { active_window: 'App', mouse_position: '1,1' },
      },
    });

    const service = new ToolExecutionService();
    await service.executeTool(
      'mouse_control',
      { action: 'click', x: 1, y: 2 },
      { correlationId: 'req-ss', skipAutoCapture: false },
    );

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockCaptureSystemState).not.toHaveBeenCalled();
    const latestToolOutputCall = mockFormatToolOutputMessage.mock.calls.at(-1);
    expect(latestToolOutputCall?.[0]).toBe('mouse_control');
    expect(latestToolOutputCall?.[1]).toEqual(expect.objectContaining({ success: true }));
    expect(latestToolOutputCall).toHaveLength(2);
  });

  test('executeTool formats and reports errors', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockRejectedValue(new Error('boom'));

    const onToolResult = jest.fn();
    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ onToolResult, sendToBackend });

    await expect(
      service.executeTool('read_file', { file_path: '/tmp/a' }, { correlationId: 'req-err' }),
    ).rejects.toThrow('boom');

    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(sendToBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-result',
        payload: expect.objectContaining({
          request_id: 'req-err',
          success: false,
        }),
      }),
    );
    expect(sendToBackend.mock.calls[0][0].payload.data).toEqual({
      llm_content: 'formatted',
    });
  });

  test('executeToolBundle executes sequentially and captures state on the last computer-use tool', async () => {
    jest.useFakeTimers();
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ success: true, data: { output: 'a' } })
      .mockResolvedValueOnce({ success: true, data: { output: 'b' } });
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: 'bundle-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
      captureMeta: { source_w: 1440, source_h: 900 },
    });

    const onBundleResult = jest.fn();
    const { service, sendToBackend } = createServiceWithSendToBackend({ onBundleResult });
    const pending = service.executeToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
      { toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } },
    ], 'bundle-1');
    await jest.runAllTimersAsync();
    const result = await pending;

    expect(invokeSpy).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
      skipAutoCapture: true,
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'mouse_control',
      args: { action: 'click', x: 1, y: 2 },
      skipAutoCapture: true,
    });
    expect(mockCaptureScreenshotAttachment).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'bundle-1:step-2:mouse_control',
    });
    expect(mockCaptureSystemState).toHaveBeenCalledWith({
      waitSeconds: 0,
      correlationId: 'bundle-1:step-2:mouse_control',
    });
    expect(result.screenshot).toBe('bundle-shot');
    expect(onBundleResult).toHaveBeenCalledTimes(1);
    expect(sendToBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-bundle-result',
        payload: expect.objectContaining({
          bundle_id: 'bundle-1',
          status: 'success',
          screenshot: 'bundle-shot',
        }),
      }),
    );
    const latestBundleOutputCall = mockFormatBundledToolOutputMessage.mock.calls.at(-1);
    expect(latestBundleOutputCall?.[0]).toEqual([
      expect.objectContaining({ tool_name: 'read_file', data: { output: 'a' } }),
      expect.objectContaining({ tool_name: 'mouse_control', data: { output: 'b' } }),
    ]);
    expect(latestBundleOutputCall?.[1]).toBe('bundle-shot');
    expect(latestBundleOutputCall).toHaveLength(2);
    jest.useRealTimers();
  });
});
