jest.mock('../../frontend/src/renderer/infrastructure/services/SystemCapture', () => ({
  extractOSstate: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/MessageFormatter', () => ({
  formatToolOutputMessage: jest.fn(() => 'formatted'),
  formatBundledToolOutputMessage: jest.fn(() => 'bundle-formatted'),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ArtifactUploader', () => ({
  uploadArtifactBase64: jest.fn().mockResolvedValue(null),
}));

import { ToolExecutionService } from '../../frontend/src/renderer/infrastructure/services/ToolExecutionService';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  formatBundledToolOutputMessage,
  formatToolOutputMessage,
} from '../../frontend/src/renderer/infrastructure/services/MessageFormatter';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';

const mockExtractOSstate = extractOSstate as jest.MockedFunction<typeof extractOSstate>;
const mockFormatToolOutputMessage = formatToolOutputMessage as jest.MockedFunction<typeof formatToolOutputMessage>;
const mockFormatBundledToolOutputMessage =
  formatBundledToolOutputMessage as jest.MockedFunction<typeof formatBundledToolOutputMessage>;

describe('ToolExecutionService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('executeTool captures screenshot for computer-use tools without screenshot', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {},
    });

    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'App' },
      screenshot: 'shot',
    });

    const onToolResult = jest.fn();
    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ onToolResult, sendToBackend });

    const result = await service.executeTool(
      'mouse_control',
      { action: 'click', x: 1, y: 2 },
      { correlationId: 'req-123', skipAutoCapture: false },
    );

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'mouse_control',
      args: { action: 'click', x: 1, y: 2 },
      skipAutoCapture: false,
    });
    expect(mockExtractOSstate).toHaveBeenCalledWith(true, true, 2, false);
    expect(result.screenshot).toBe('shot');
    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(sendToBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-result',
        payload: expect.objectContaining({
          request_id: 'req-123',
          success: true,
          data: expect.objectContaining({
            llm_content: 'formatted',
            is_preformatted: true,
          }),
        }),
      }),
    );
    expect(mockFormatToolOutputMessage).toHaveBeenCalled();
  });

  test('executeTool skips auto capture for non computer-use tools', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: { output: 'ok' },
    });

    const service = new ToolExecutionService();
    const result = await service.executeTool(
      'read_file',
      { file_path: '/tmp/a' },
      { correlationId: 'req-456', skipAutoCapture: false },
    );

    expect(mockExtractOSstate).not.toHaveBeenCalled();
    expect(result.screenshot).toBeNull();
  });

  test('executeTool reuses system_state and screenshot from tool result', async () => {
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

    expect(mockExtractOSstate).not.toHaveBeenCalled();
    expect(mockFormatToolOutputMessage).toHaveBeenCalledWith(
      'mouse_control',
      expect.objectContaining({ success: true }),
      { active_window: 'App', mouse_position: '1,1' },
    );
  });

  test('executeTool honors skipAutoCapture for computer-use tools', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {},
    });

    const service = new ToolExecutionService();
    await service.executeTool(
      'mouse_control',
      { action: 'click', x: 1, y: 2 },
      { correlationId: 'req-skip', skipAutoCapture: true },
    );

    expect(mockExtractOSstate).not.toHaveBeenCalled();
  });

  test('executeTool treats run_shell_command with wait as computer-use tool', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {},
    });

    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'Shell' },
      screenshot: 'shell-shot',
    });

    const service = new ToolExecutionService();
    await service.executeTool(
      'run_shell_command',
      { command: 'echo hi', wait: 5 },
      { correlationId: 'req-789', skipAutoCapture: false },
    );

    expect(mockExtractOSstate).toHaveBeenCalledWith(true, true, 5, false);
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
          data: expect.objectContaining({
            llm_content: 'formatted',
            is_preformatted: true,
          }),
        }),
      }),
    );
  });

  test('executeToolBundle executes sequentially and captures state on last computer-use tool', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ success: true, data: { output: 'a' } })
      .mockResolvedValueOnce({ success: true, data: { output: 'b' } });

    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'App' },
      screenshot: 'bundle-shot',
    });

    const onBundleResult = jest.fn();
    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ onBundleResult, sendToBackend });

    const result = await service.executeToolBundle(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } },
      ],
      'bundle-1',
    );

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
    expect(mockExtractOSstate).toHaveBeenCalledWith(true, true, 0, false);
    expect(result.screenshot).toBe('bundle-shot');
    expect(onBundleResult).toHaveBeenCalledTimes(1);
    expect(sendToBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-bundle-result',
        payload: expect.objectContaining({
          bundle_id: 'bundle-1',
          status: 'success',
        }),
      }),
    );
    expect(mockFormatBundledToolOutputMessage).toHaveBeenCalled();
  });

  test('executeToolBundle fails fast and reports partial failure', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValueOnce({
      success: false,
      error: 'fail',
      data: null,
    });

    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ sendToBackend });

    const result = await service.executeToolBundle(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } },
      ],
      'bundle-2',
    );

    expect(result.results).toHaveLength(1);
    expect(sendToBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-bundle-result',
        payload: expect.objectContaining({
          bundle_id: 'bundle-2',
          status: 'partial_failure',
        }),
      }),
    );
  });

  test('executeToolBundle reports failure and error when last tool fails', async () => {
    jest.spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ success: true, data: { output: 'ok' } })
      .mockResolvedValueOnce({ success: false, error: 'boom', data: null });

    const sendToBackend = jest.fn();
    const service = new ToolExecutionService({ sendToBackend });

    const result = await service.executeToolBundle(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } },
      ],
      'bundle-3',
    );

    expect(result.results).toHaveLength(2);
    expect(sendToBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-bundle-result',
        payload: expect.objectContaining({
          bundle_id: 'bundle-3',
          status: 'failure',
          error: 'boom',
        }),
      }),
    );
  });
});
