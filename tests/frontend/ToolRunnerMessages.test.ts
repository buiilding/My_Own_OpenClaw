import {
  buildBundleOutputMessage,
  buildToolOutputMessage,
  buildTranscriptMetadata,
  mapBundleTools,
  resolveToolCallCorrelationId,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerMessages';

describe('toolRunnerMessages', () => {
  test('buildToolOutputMessage maps tool result fields and metadata', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('msg-1');

    const message = buildToolOutputMessage({
      toolName: 'read_file',
      formattedMessage: 'tool output',
      executionTime: 1.23,
      correlationId: 'corr-1',
      screenshotRef: 'artifact-1',
      screenshotUrl: 'https://example.com/shot.png',
      result: {
        success: true,
        data: {
          output: 'ok',
          metadata: { rows: 2 },
        },
      },
    } as any);

    expect(message).toEqual({
      id: 'msg-1',
      text: 'tool output',
      sender: 'assistant',
      type: 'tool-output',
      screenshot: null,
      screenshotRef: 'artifact-1',
      screenshotUrl: 'https://example.com/shot.png',
      screenshotContentType: null,
      toolMetadata: { rows: 2 },
      toolName: 'read_file',
      sourceChannel: 'renderer-tool-runner',
      sourceEventType: 'tool-runner-result',
      executionTime: 1.23,
      success: true,
      correlationId: 'corr-1',
      modelFacingToolOutput: 'tool output',
      toolOutputDetails: {
        result: {
          success: true,
          data: {
            output: 'ok',
            metadata: { rows: 2 },
          },
        },
        system_state: null,
        correlation_id: 'corr-1',
        tool_name: 'read_file',
        execution_time: 1.23,
      },
    });

    uuidSpy.mockRestore();
  });

  test('buildToolOutputMessage falls back to null screenshot and metadata', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('msg-2');

    const message = buildToolOutputMessage({
      toolName: 'read_file',
      formattedMessage: 'tool output',
      executionTime: 0.5,
      correlationId: 'corr-2',
      screenshotRef: '',
      screenshotUrl: '',
      result: {
        success: false,
        data: 'not-an-object',
      },
    } as any);

    expect(message.screenshotRef).toBeNull();
    expect(message.screenshotUrl).toBeNull();
    expect(message.toolMetadata).toBeNull();
    expect(message.success).toBe(false);
    uuidSpy.mockRestore();
  });

  test('buildToolOutputMessage preserves inline screenshot fallback when no artifact url or ref exists', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('msg-inline');

    const message = buildToolOutputMessage({
      toolName: 'mouse_control',
      formattedMessage: 'clicked',
      executionTime: 0.2,
      correlationId: 'corr-inline',
      screenshot: 'inline-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
      result: {
        success: true,
        data: {
          output: 'clicked',
        },
      },
    } as any);

    expect(message.screenshot).toBe('inline-shot');
    expect(message.screenshotContentType).toBe('image/png');
    expect(message.screenshotRef).toBeNull();
    expect(message.screenshotUrl).toBeNull();
    uuidSpy.mockRestore();
  });

  test('buildBundleOutputMessage builds bundled metadata and success flag', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('bundle-1');

    const successMessage = buildBundleOutputMessage({
      formattedMessage: 'bundle output',
      screenshotRef: null,
      screenshotUrl: null,
      totalTime: 2.5,
      correlationId: 'corr-bundle',
      results: [
        { tool_name: 'a', success: true, error: null },
        { tool_name: 'b', success: true, error: null },
      ],
    } as any);

    expect(successMessage.toolName).toBe('bundled_tools (2 tools)');
    expect(successMessage.success).toBe(true);
    expect(successMessage.toolMetadata).toEqual({
      bundled: true,
      tool_count: 2,
      tools: [
        { tool_name: 'a', success: true, error: null },
        { tool_name: 'b', success: true, error: null },
      ],
    });
    expect(successMessage.modelFacingToolOutput).toBe('bundle output');
    expect(successMessage.toolOutputDetails).toEqual({
      bundled: true,
      results: [
        { tool_name: 'a', success: true, error: null },
        { tool_name: 'b', success: true, error: null },
      ],
      correlation_id: 'corr-bundle',
      execution_time_total: 2.5,
    });

    const failedMessage = buildBundleOutputMessage({
      formattedMessage: 'bundle output',
      screenshotRef: null,
      screenshotUrl: null,
      totalTime: 1,
      correlationId: 'corr-bundle-2',
      results: [
        { tool_name: 'a', success: true, error: null },
        { tool_name: 'b', success: false, error: 'nope' },
      ],
    } as any);
    expect(failedMessage.success).toBe(false);

    uuidSpy.mockRestore();
  });

  test('buildTranscriptMetadata normalizes screenshotRef', () => {
    expect(
      buildTranscriptMetadata(
        'read_file',
        'corr-1',
        undefined,
        { modelId: 'm1', modelProvider: 'p1' },
      ),
    ).toEqual({
      messageType: 'tool-output',
      toolName: 'read_file',
      correlationId: 'corr-1',
      screenshotRef: null,
      modelId: 'm1',
      modelProvider: 'p1',
    });
  });

  test('mapBundleTools filters invalid names and normalizes args', () => {
    expect(
      mapBundleTools([
        { name: 'read_file', args: { file_path: '/tmp/a' } },
        { name: '', args: { ignored: true } },
        { name: 123, args: { ignored: true } },
        { name: 'noop', args: 'not-an-object' },
      ]),
    ).toEqual([
      { toolName: 'read_file', args: { file_path: '/tmp/a' } },
      { toolName: 'noop', args: {} },
    ]);

    expect(mapBundleTools(null)).toEqual([]);
    expect(mapBundleTools('not-an-array' as any)).toEqual([]);
  });

  test('resolveToolCallCorrelationId prefers explicit payload ids before event id and uuid', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-fallback');

    expect(resolveToolCallCorrelationId({ correlation_id: 'corr-1', request_id: 'req-1' }, 'event-1')).toBe('corr-1');
    expect(resolveToolCallCorrelationId({ request_id: 'req-1' }, 'event-1')).toBe('req-1');
    expect(resolveToolCallCorrelationId({ correlation_id: '   ', request_id: ' req-2 ' }, 'event-1')).toBe('req-2');
    expect(resolveToolCallCorrelationId({}, ' event-2 ')).toBe('event-2');
    expect(resolveToolCallCorrelationId({}, 'event-1')).toBe('event-1');
    expect(resolveToolCallCorrelationId({}, '   ')).toBe('uuid-fallback');
    expect(resolveToolCallCorrelationId(undefined, undefined)).toBe('uuid-fallback');

    uuidSpy.mockRestore();
  });
});
