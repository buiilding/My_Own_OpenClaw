jest.mock('../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionInvoker', () => ({
  invokeTool: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionCapture', () => ({
  ensureAutoCapture: jest.fn(),
  isComputerUseTool: jest.fn(),
  resolveExplicitPostActionWaitSeconds: jest.fn(),
  resolvePostActionWaitSeconds: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionLogger', () => ({
  logBundledToolStart: jest.fn(),
  logBundledToolTiming: jest.fn(),
}));

import { runToolBundle } from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionBundleRunner';
import { invokeTool } from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionInvoker';
import {
  ensureAutoCapture,
  isComputerUseTool,
  resolveExplicitPostActionWaitSeconds,
  resolvePostActionWaitSeconds,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionCapture';

const mockInvokeTool = invokeTool as jest.MockedFunction<typeof invokeTool>;
const mockEnsureAutoCapture = ensureAutoCapture as jest.MockedFunction<typeof ensureAutoCapture>;
const mockIsComputerUseTool = isComputerUseTool as jest.MockedFunction<typeof isComputerUseTool>;
const mockResolveExplicitPostActionWaitSeconds = (
  resolveExplicitPostActionWaitSeconds as jest.MockedFunction<typeof resolveExplicitPostActionWaitSeconds>
);
const mockResolvePostActionWaitSeconds = (
  resolvePostActionWaitSeconds as jest.MockedFunction<typeof resolvePostActionWaitSeconds>
);
const READ_FILE_STEP = { toolName: 'read_file', args: { file_path: '/tmp/a' } };
const MOUSE_CLICK_STEP = { toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } };
const READ_FILE_BUNDLE_ID = 'bundle-read-file';
const DEFAULT_TWO_STEP_BUNDLE_ID = 'bundle-two-step';

const runReadFileBundle = () => runToolBundle([READ_FILE_STEP], READ_FILE_BUNDLE_ID);
const runDefaultTwoStepBundle = () => runToolBundle([READ_FILE_STEP, MOUSE_CLICK_STEP], DEFAULT_TWO_STEP_BUNDLE_ID);
const expectSingleStepResult = (
  outcome: Awaited<ReturnType<typeof runReadFileBundle>>,
  status: 'ok' | 'error',
  output: string,
) => {
  expect(outcome.stepResults).toEqual([
    { tool: 'read_file', status, output },
  ]);
};
const mockSingleReadFileInvokeResult = (result: unknown) => {
  mockInvokeTool.mockResolvedValueOnce({
    result,
    toolInvokeTime: 0.01,
  } as any);
};
const mockTwoStepInvokeResults = (firstResult: unknown, secondResult: unknown) => {
  mockInvokeTool
    .mockResolvedValueOnce({
      result: firstResult,
      toolInvokeTime: 0.01,
    } as any)
    .mockResolvedValueOnce({
      result: secondResult,
      toolInvokeTime: 0.02,
    } as any);
};

describe('ToolExecutionBundleRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockIsComputerUseTool.mockReturnValue(false);
    mockResolveExplicitPostActionWaitSeconds.mockReturnValue(0);
    mockResolvePostActionWaitSeconds.mockReturnValue(2);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('runs tools sequentially and captures only for computer-use tools', async () => {
    mockTwoStepInvokeResults(
      { success: true, data: { output: 'first' } },
      { success: true, data: { output: 'second' } },
    );
    mockIsComputerUseTool
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mockEnsureAutoCapture.mockResolvedValue({
      screenshot: 'shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
      captureMeta: null,
      systemState: { active_window: 'App' } as any,
      waitDelay: 2,
      captureTime: 0.03,
      isComputerTool: true,
    });

    const outcome = await runDefaultTwoStepBundle();

    expect(mockInvokeTool).toHaveBeenNthCalledWith(1, READ_FILE_STEP.toolName, READ_FILE_STEP.args, true);
    expect(mockInvokeTool).toHaveBeenNthCalledWith(2, MOUSE_CLICK_STEP.toolName, MOUSE_CLICK_STEP.args, true);
    expect(mockEnsureAutoCapture).toHaveBeenCalledWith(
      'mouse_control',
      MOUSE_CLICK_STEP.args,
      false,
      { success: true, data: { output: 'second' } },
      'bundle-two-step:step-2:mouse_control',
      2,
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

    const outcome = await runDefaultTwoStepBundle();

    expect(mockInvokeTool).toHaveBeenCalledTimes(1);
    expect(outcome.stepResults).toEqual([
      { tool: 'read_file', status: 'error', output: 'boom' },
    ]);
  });

  test('converts thrown non-error values to step output text', async () => {
    mockInvokeTool.mockRejectedValueOnce('bad failure');

    const outcome = await runReadFileBundle();

    expectSingleStepResult(outcome, 'error', 'bad failure');
    expect(outcome.toolExecutionTimes).toHaveLength(1);
  });

  test('uses Error.message when invokeTool throws an Error', async () => {
    mockInvokeTool.mockRejectedValueOnce(new Error('explicit error'));

    const outcome = await runReadFileBundle();

    expectSingleStepResult(outcome, 'error', 'explicit error');
  });

  test('uses Unknown error when thrown value is non-string and non-Error', async () => {
    mockInvokeTool.mockRejectedValueOnce(404);

    const outcome = await runReadFileBundle();

    expectSingleStepResult(outcome, 'error', 'Unknown error');
  });

  test('uses no-output success fallback when tool succeeds without output payload', async () => {
    mockSingleReadFileInvokeResult({ success: true, data: { value: 'no-output-field' } });

    const outcome = await runReadFileBundle();

    expectSingleStepResult(outcome, 'ok', 'Tool read_file executed successfully (no output)');
  });

  test('uses llm_content for success output when output field is missing', async () => {
    mockSingleReadFileInvokeResult({
      success: true,
      data: { content: 'raw-file-content', llm_content: 'formatted-file-content' },
    });

    const outcome = await runReadFileBundle();

    expectSingleStepResult(outcome, 'ok', 'formatted-file-content');
  });

  test('uses Unknown error output when failed result has no error text', async () => {
    mockSingleReadFileInvokeResult({ success: false, data: null });

    const outcome = await runReadFileBundle();

    expectSingleStepResult(outcome, 'error', 'Unknown error');
  });

  test('captures non-final computer tool without overwriting systemState', async () => {
    mockTwoStepInvokeResults(
      { success: true, data: { output: 'step-1' } },
      { success: true, data: { output: 'step-2' } },
    );
    mockIsComputerUseTool
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mockResolveExplicitPostActionWaitSeconds.mockReturnValueOnce(1);
    mockEnsureAutoCapture.mockResolvedValue({
      screenshot: 'shot-1',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
      captureMeta: null,
      systemState: { active_window: 'First' } as any,
      waitDelay: 1,
      captureTime: 0.5,
      isComputerTool: true,
    });

    const outcome = await runToolBundle([
      { toolName: 'mouse_control', args: { action: 'move', x: 1, y: 2 } },
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
    ], 'bundle-two-step-non-final-capture');

    expect(mockEnsureAutoCapture).toHaveBeenCalledWith(
      'mouse_control',
      { action: 'move', x: 1, y: 2 },
      false,
      { success: true, data: { output: 'step-1' } },
      'bundle-two-step-non-final-capture:step-1:mouse_control',
      1,
    );
    expect(outcome.systemState).toEqual({ active_window: 'First' });
    expect(outcome.screenshot).toBe('shot-1');
    expect(outcome.totalWaitDelay).toBe(1);
    expect(outcome.totalCaptureTime).toBe(0.5);
  });

  test('fails current step when final bundle capture throws for a computer-use tool', async () => {
    mockInvokeTool.mockResolvedValueOnce({
      result: { success: true, data: { output: 'step-1' } },
      toolInvokeTime: 0.01,
    } as any);
    mockIsComputerUseTool.mockReturnValueOnce(true);
    mockEnsureAutoCapture.mockRejectedValueOnce(new Error('capture failed'));

    const outcome = await runToolBundle(
      [{ toolName: 'mouse_control', args: { action: 'click', x: 1, y: 2 } }],
      'bundle-capture-throw',
    );

    expect(outcome.stepResults).toEqual([
      { tool: 'mouse_control', status: 'ok', output: 'step-1' },
      { tool: 'mouse_control', status: 'error', output: 'capture failed' },
    ]);
    expect(outcome.screenshot).toBeNull();
    expect(outcome.systemState).toBeNull();
  });

  test('uses the accumulated explicit wait budget for final bundle capture', async () => {
    mockInvokeTool
      .mockResolvedValueOnce({
        result: { success: true, data: { output: 'waited' } },
        toolInvokeTime: 0.01,
      } as any)
      .mockResolvedValueOnce({
        result: { success: true, data: { output: 'switched' } },
        toolInvokeTime: 0.02,
      } as any);
    mockIsComputerUseTool
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    mockResolveExplicitPostActionWaitSeconds
      .mockReturnValueOnce(1.5)
      .mockReturnValueOnce(0.5);
    mockEnsureAutoCapture.mockResolvedValue({
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      captureMeta: null,
      systemState: { active_window: 'Target' } as any,
      waitDelay: 2,
      captureTime: 0.25,
      isComputerTool: true,
    });

    const outcome = await runToolBundle([
      { toolName: 'wait', args: { seconds: 1.5 } },
      { toolName: 'switch_window', args: { tab_name: 'Target' } },
    ], 'bundle-accumulated-wait');

    expect(mockResolvePostActionWaitSeconds).not.toHaveBeenCalled();
    expect(mockEnsureAutoCapture).toHaveBeenCalledWith(
      'switch_window',
      { tab_name: 'Target' },
      false,
      { success: true, data: { output: 'switched' } },
      'bundle-accumulated-wait:step-2:switch_window',
      2,
    );
    expect(outcome.totalWaitDelay).toBe(2);
    expect(outcome.systemState).toEqual({ active_window: 'Target' });
  });
});
