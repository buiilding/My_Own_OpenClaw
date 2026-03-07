import {
  buildToolBundleBackendEnvelope,
  buildToolResultBackendEnvelope,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionBackendPayload';

describe('ToolExecutionBackendPayload', () => {
  test('buildToolResultBackendEnvelope shapes tool-result payload with normalized llm content', () => {
    const envelope = buildToolResultBackendEnvelope({
      correlationId: 'req-123',
      result: {
        success: true,
        data: {
          output: 'ok',
          screenshot: 'inline-base64',
          screenshot_ref: 'sidecar-ref',
        },
      },
      formattedMessage: 'formatted',
      includeScreenshot: false,
      includeSystemState: false,
    });

    expect(envelope).toEqual({
      type: 'tool-result',
      payload: {
        request_id: 'req-123',
        success: true,
        error: undefined,
        data: {
          output: 'ok',
          llm_content: 'formatted',
        },
      },
    });
  });

  test('buildToolResultBackendEnvelope includes screenshot and normalized system state when requested', () => {
    const envelope = buildToolResultBackendEnvelope({
      correlationId: 'req-computer',
      result: {
        success: true,
        data: {
          output: 'done',
          capture_meta: { source_w: 1920, source_h: 1080 },
        },
      },
      formattedMessage: 'formatted',
      screenshotRef: 'artifact-ref-1',
      includeScreenshot: true,
      includeSystemState: true,
      systemState: {
        active_window: 'Editor',
      },
    });

    expect(envelope).toEqual({
      type: 'tool-result',
      payload: {
        request_id: 'req-computer',
        success: true,
        error: undefined,
        data: {
          output: 'done',
          llm_content: 'formatted',
          screenshot_ref: 'artifact-ref-1',
          capture_meta: { source_w: 1920, source_h: 1080 },
          system_state: {
            active_window: 'Editor',
            mouse_position: 'Unknown',
          },
        },
      },
    });
  });

  test('buildToolResultBackendEnvelope prefers explicit screenshotRef over inline screenshot candidates', () => {
    const envelope = buildToolResultBackendEnvelope({
      correlationId: 'req-precedence',
      result: {
        success: true,
        data: {
          output: 'done',
          screenshot: 'inline-from-sidecar',
          screenshot_ref: 'sidecar-ref',
        },
      },
      formattedMessage: 'formatted',
      includeScreenshot: true,
      screenshot: 'inline-explicit',
      screenshotRef: 'artifact-explicit',
    });

    expect(envelope).toEqual({
      type: 'tool-result',
      payload: {
        request_id: 'req-precedence',
        success: true,
        error: undefined,
        data: {
          output: 'done',
          llm_content: 'formatted',
          screenshot_ref: 'artifact-explicit',
        },
      },
    });
  });

  test('buildToolResultBackendEnvelope normalizes fallback camelCase system_state fields from tool payload', () => {
    const envelope = buildToolResultBackendEnvelope({
      correlationId: 'req-system-fallback',
      result: {
        success: true,
        data: {
          output: 'done',
          system_state: {
            activeWindow: 'Browser',
            mousePosition: '(10,20)',
            screenResolution: '2560x1440',
          },
        },
      },
      formattedMessage: 'formatted',
      includeSystemState: true,
    });

    expect(envelope).toEqual({
      type: 'tool-result',
      payload: {
        request_id: 'req-system-fallback',
        success: true,
        error: undefined,
        data: {
          output: 'done',
          llm_content: 'formatted',
          system_state: {
            active_window: 'Browser',
            mouse_position: '(10,20)',
          },
          system_state_internal: {
            active_window: 'Browser',
            mouse_position: '(10,20)',
            screen_resolution: '2560x1440',
          },
        },
      },
    });
  });

  test('buildToolBundleBackendEnvelope omits optional screenshot/system fields when not requested', () => {
    const envelope = buildToolBundleBackendEnvelope({
      bundleId: 'bundle-1',
      status: 'success',
      stepResults: [{ tool: 'read_file', status: 'ok', output: 'ok' }],
      error: null,
      includeScreenshot: false,
      includeSystemState: false,
      screenshotRef: 'artifact-1',
      captureMeta: { source_w: 100, source_h: 100 },
      systemState: { active_window: 'App', mouse_position: '(1,1)' },
    });

    expect(envelope).toEqual({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-1',
        status: 'success',
        step_results: [{ tool: 'read_file', status: 'ok', output: 'ok' }],
        error: null,
      },
    });
  });

  test('buildToolBundleBackendEnvelope includes screenshot/system payload fields when requested', () => {
    const envelope = buildToolBundleBackendEnvelope({
      bundleId: 'bundle-2',
      status: 'failure',
      stepResults: [{ tool: 'mouse_control', status: 'error', output: 'boom' }],
      error: 'boom',
      includeScreenshot: true,
      includeSystemState: true,
      screenshotRef: 'artifact-2',
      captureMeta: { source_w: 1440, source_h: 900 },
      systemState: { active_window: 'App', mouse_position: '(2,3)' },
    });

    expect(envelope).toEqual({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-2',
        status: 'failure',
        step_results: [{ tool: 'mouse_control', status: 'error', output: 'boom' }],
        error: 'boom',
        screenshot_ref: 'artifact-2',
        capture_meta: { source_w: 1440, source_h: 900 },
        system_state: { active_window: 'App', mouse_position: '(2,3)' },
      },
    });
  });
});
