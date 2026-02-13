jest.mock('../../frontend/src/renderer/infrastructure/services/ToolExecutionInvoker', () => ({
  invokeTool: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ToolExecutionCapture', () => ({
  captureAfterTool: jest.fn(),
  isComputerUseTool: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ToolExecutionLogger', () => ({
  logBundledToolStart: jest.fn(),
  logBundledToolTiming: jest.fn(),
}));

import { runToolBundle } from '../../frontend/src/renderer/infrastructure/services/ToolExecutionBundleRunner';
import { invokeTool } from '../../frontend/src/renderer/infrastructure/services/ToolExecutionInvoker';
import {
  captureAfterTool,
  isComputerUseTool,
} from '../../frontend/src/renderer/infrastructure/services/ToolExecutionCapture';

const mockInvokeTool = invokeTool as jest.MockedFunction<typeof invokeTool>;
const mockCaptureAfterTool = captureAfterTool as jest.MockedFunction<typeof captureAfterTool>;
const mockIsComputerUseTool = isComputerUseTool as jest.MockedFunction<typeof isComputerUseTool>;

describe('ToolExecutionBundleRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockIsComputerUseTool.mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('runs tools sequentially and captures only for computer-use tools', async () => {
    mockInvokeTool
      .mockResolvedValueOnce({
        result: { success: true, data: { output: 'first' } },
        toolInvokeTime: 0.01,
      })
      .mockResolvedValueOnce({
        result: { success: true, data: { output: 'second' } },
        toolInvokeTime: 0.02,
      });
    mockIsComputerUseTool
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mockCaptureAfterTool.mockResolvedValue({
      screenshot: 'shot',
      screenshotContentType: 'image/png',
      systemState: { active_window: 'App' } as any,
      waitSeconds: 0,
      captureTime: 0.03,
    });

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
      { toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } },
    ]);

    expect(mockInvokeTool).toHaveBeenNthCalledWith(1, 'read_file', { file_path: '/tmp/a' }, true);
    expect(mockInvokeTool).toHaveBeenNthCalledWith(2, 'mouse_control', { action: 'click', x: 1, y: 2 }, true);
    expect(mockCaptureAfterTool).toHaveBeenCalledWith(
      'mouse_control',
      { action: 'click', x: 1, y: 2 },
      true,
      0,
    );
    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'ok', output: 'first' },
      { tool: 'mouse_control', status: 'ok', output: 'second' },
    ]);
    expect(outcome.screenshot).toBe('shot');
    expect(outcome.screenshotContentType).toBe('image/png');
    expect(outcome.systemState).toEqual({ active_window: 'App' });
    expect(outcome.toolExecutionTimes).toEqual([
      { tool: 'read_file', time: 0.01 },
      { tool: 'mouse_control', time: 0.02 },
    ]);
  });

  test('fails fast when tool result is unsuccessful', async () => {
    mockInvokeTool.mockResolvedValueOnce({
      result: { success: false, error: 'boom', data: null },
      toolInvokeTime: 0.01,
    });

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
      { toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } },
    ]);

    expect(mockInvokeTool).toHaveBeenCalledTimes(1);
    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'error', output: 'boom' },
    ]);
  });

  test('converts thrown non-error values to step output text', async () => {
    mockInvokeTool.mockRejectedValueOnce('bad failure');

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ]);

    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'error', output: 'bad failure' },
    ]);
    expect(outcome.toolExecutionTimes).toHaveLength(1);
  });

  test('uses Error.message when invokeTool throws an Error', async () => {
    mockInvokeTool.mockRejectedValueOnce(new Error('explicit error'));

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ]);

    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'error', output: 'explicit error' },
    ]);
  });

  test('uses Unknown error when thrown value is non-string and non-Error', async () => {
    mockInvokeTool.mockRejectedValueOnce(404);

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ]);

    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'error', output: 'Unknown error' },
    ]);
  });

  test('uses no-output success fallback when tool succeeds without output payload', async () => {
    mockInvokeTool.mockResolvedValueOnce({
      result: { success: true, data: { value: 'no-output-field' } },
      toolInvokeTime: 0.01,
    });

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ]);

    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'ok', output: 'Tool read_file executed successfully (no output)' },
    ]);
  });

  test('uses llm_content for success output when output field is missing', async () => {
    mockInvokeTool.mockResolvedValueOnce({
      result: { success: true, data: { content: 'raw-file-content', llm_content: 'formatted-file-content' } },
      toolInvokeTime: 0.01,
    });

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ]);

    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'ok', output: 'formatted-file-content' },
    ]);
  });

  test('uses Unknown error output when failed result has no error text', async () => {
    mockInvokeTool.mockResolvedValueOnce({
      result: { success: false, data: null },
      toolInvokeTime: 0.01,
    } as any);

    const outcome = await runToolBundle([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ]);

    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'error', output: 'Unknown error' },
    ]);
  });

  test('captures non-final computer tool without overwriting systemState', async () => {
    mockInvokeTool
      .mockResolvedValueOnce({
        result: { success: true, data: { output: 'step-1' } },
        toolInvokeTime: 0.01,
      })
      .mockResolvedValueOnce({
        result: { success: true, data: { output: 'step-2' } },
        toolInvokeTime: 0.02,
      });
    mockIsComputerUseTool
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mockCaptureAfterTool.mockResolvedValue({
      screenshot: 'shot-1',
      screenshotContentType: 'image/png',
      systemState: { active_window: 'First' } as any,
      waitSeconds: 1,
      captureTime: 0.5,
    });

    const outcome = await runToolBundle([
      { toolName: 'mouse_control', args: { action: 'move', x: 1, y: 2 } },
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ]);

    expect(mockCaptureAfterTool).toHaveBeenCalledWith(
      'mouse_control',
      { action: 'move', x: 1, y: 2 },
      false,
      0,
    );
    expect(outcome.systemState).toBeNull();
    expect(outcome.screenshot).toBe('shot-1');
    expect(outcome.totalWaitDelay).toBe(1);
    expect(outcome.totalCaptureTime).toBe(0.5);
  });
});
