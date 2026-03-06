import {
  emitToolExecutionBundleResult,
  emitToolExecutionResult,
  sendToolExecutionBundleResultToBackend,
  sendToolExecutionResultToBackend,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionResultDispatch';

describe('ToolExecutionResultDispatch', () => {
  test('emits tool and bundle results when callbacks exist', () => {
    const onToolResult = jest.fn();
    const onBundleResult = jest.fn();
    const callbacks = { onToolResult, onBundleResult };

    emitToolExecutionResult(callbacks, {
      toolName: 'read_file',
      result: { success: true, data: { output: 'ok' } },
      executionTime: 0.1,
      correlationId: 'req-1',
      formattedMessage: 'ok',
    });
    emitToolExecutionBundleResult(callbacks, {
      correlationId: 'bundle-1',
      results: [{ tool_name: 'read_file', success: true }],
      totalTime: 0.2,
      formattedMessage: 'done',
    });

    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(onBundleResult).toHaveBeenCalledTimes(1);
  });

  test('sends normalized envelopes when backend callback exists', () => {
    const sendToBackend = jest.fn();
    const callbacks = { sendToBackend };

    sendToolExecutionResultToBackend(callbacks, {
      correlationId: 'req-1',
      result: { success: true, data: { output: 'ok' } },
      formattedMessage: 'ok',
      systemState: null,
      includeScreenshot: false,
      screenshotRef: null,
    });
    sendToolExecutionBundleResultToBackend(callbacks, {
      bundleId: 'bundle-1',
      status: 'success',
      stepResults: [],
      screenshotRef: null,
      captureMeta: null,
      systemState: null,
      error: null,
      includeScreenshot: false,
      includeSystemState: false,
    });

    expect(sendToBackend).toHaveBeenCalledTimes(2);
    expect(sendToBackend.mock.calls[0][0]).toMatchObject({
      type: 'tool-result',
      payload: expect.objectContaining({ request_id: 'req-1' }),
    });
    expect(sendToBackend.mock.calls[1][0]).toMatchObject({
      type: 'tool-bundle-result',
      payload: expect.objectContaining({ bundle_id: 'bundle-1' }),
    });
  });
});
