import {
  buildBundledToolResults,
  resolveBundleErrorMessage,
  resolveBundleStatus,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/BundleExecutionModel';

describe('BundleExecutionModel', () => {
  test('resolveBundleStatus returns success partial failure and failure states', () => {
    expect(resolveBundleStatus([{ tool: 'a', status: 'ok', output: 'ok' }], 1)).toBe('success');
    expect(resolveBundleStatus([{ tool: 'a', status: 'error', output: 'boom' }], 2)).toBe('partial_failure');
    expect(resolveBundleStatus([
      { tool: 'a', status: 'ok', output: 'ok' },
      { tool: 'b', status: 'error', output: 'boom' },
    ], 2)).toBe('failure');
  });

  test('buildBundledToolResults returns one canonical result shape', () => {
    expect(buildBundledToolResults([
      { tool: 'read_file', status: 'ok', output: 'done' },
      { tool: 'mouse_control', status: 'error', output: 'failed' },
    ])).toEqual([
      expect.objectContaining({
        tool_name: 'read_file',
        request_id: '',
        success: true,
        error: null,
        executionTime: 0,
        data: { output: 'done' },
        _rawResult: {
          success: true,
          error: null,
          data: { output: 'done' },
        },
      }),
      expect.objectContaining({
        tool_name: 'mouse_control',
        request_id: '',
        success: false,
        error: 'failed',
        executionTime: 0,
        data: { output: 'failed' },
        _rawResult: {
          success: false,
          error: 'failed',
          data: { output: 'failed' },
        },
      }),
    ]);
  });

  test('resolveBundleErrorMessage only surfaces failure-level bundle errors', () => {
    const stepResults = [{ tool: 'a', status: 'error' as const, output: 'tool failed' }];
    expect(resolveBundleErrorMessage('partial_failure', stepResults)).toBeNull();
    expect(resolveBundleErrorMessage('success', stepResults)).toBeNull();
    expect(resolveBundleErrorMessage('failure', stepResults)).toBe('tool failed');
  });
});
