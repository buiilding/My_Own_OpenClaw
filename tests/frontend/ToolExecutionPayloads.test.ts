import {
  buildToolResultPayloadData,
  normalizeBundleStepResults,
  resolveBundleErrorMessage,
  resolveBundleStatus,
  toBundleExecutionResults,
} from '../../frontend/src/renderer/infrastructure/services/ToolExecutionPayloads';

describe('ToolExecutionPayloads', () => {
  test('buildToolResultPayloadData strips raw screenshot payload fields', () => {
    const payload = buildToolResultPayloadData(
      {
        success: true,
        data: {
          output: 'ok',
          screenshot: 'shot',
          image_data: 'inline',
          screenshot_ref: 'existing-ref',
        },
      },
      'formatted',
    );

    expect(payload).toEqual({
      output: 'ok',
      screenshot_ref: 'existing-ref',
      llm_content: 'formatted',
      is_preformatted: true,
    });
  });

  test('buildToolResultPayloadData overrides screenshot_ref with uploaded artifact id', () => {
    const payload = buildToolResultPayloadData(
      {
        success: true,
        data: {
          output: 'ok',
          screenshot_ref: 'old-ref',
        },
      },
      'formatted',
      'new-ref',
    );

    expect(payload).toEqual({
      output: 'ok',
      screenshot_ref: 'new-ref',
      llm_content: 'formatted',
      is_preformatted: true,
    });
  });

  test('resolveBundleStatus returns success/partial/failure states', () => {
    expect(
      resolveBundleStatus(
        [{ tool: 'a', status: 'ok', output: 'ok' }],
        1,
      ),
    ).toBe('success');

    expect(
      resolveBundleStatus(
        [{ tool: 'a', status: 'error', output: 'boom' }],
        2,
      ),
    ).toBe('partial_failure');

    expect(
      resolveBundleStatus(
        [{ tool: 'a', status: 'ok', output: 'ok' }, { tool: 'b', status: 'error', output: 'boom' }],
        2,
      ),
    ).toBe('failure');
  });

  test('normalizes bundle step results and converts to bundle execution result shape', () => {
    const normalized = normalizeBundleStepResults([
      { tool: 'read_file', status: 'ok', output: 'done' },
      { tool: 'mouse_control', status: 'error', output: 'failed' },
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({
        tool_name: 'read_file',
        success: true,
        error: null,
        data: { output: 'done' },
        _rawResult: expect.objectContaining({
          data: { output: 'done' },
        }),
      }),
      expect.objectContaining({
        tool_name: 'mouse_control',
        success: false,
        error: 'failed',
        data: { output: 'failed' },
        _rawResult: expect.objectContaining({
          data: { output: 'failed' },
        }),
      }),
    ]);

    const bundleResults = toBundleExecutionResults(normalized);
    expect(bundleResults).toEqual([
      expect.objectContaining({
        tool_name: 'read_file',
        request_id: '',
        executionTime: 0,
        data: { output: 'done' },
      }),
      expect.objectContaining({
        tool_name: 'mouse_control',
        request_id: '',
        executionTime: 0,
        data: { output: 'failed' },
      }),
    ]);
  });

  test('resolveBundleErrorMessage returns only failure-level errors', () => {
    const stepResults = [{ tool: 'a', status: 'error' as const, output: 'tool failed' }];
    expect(resolveBundleErrorMessage('partial_failure', stepResults)).toBeNull();
    expect(resolveBundleErrorMessage('success', stepResults)).toBeNull();
    expect(resolveBundleErrorMessage('failure', stepResults)).toBe('tool failed');
  });
});
