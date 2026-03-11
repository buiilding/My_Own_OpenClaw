import {
  buildToolResultPayloadData,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionPayloads';

describe('ToolExecutionPayloads', () => {
  test('buildToolResultPayloadData strips raw screenshot payload fields for non-computer tools', () => {
    const payload = buildToolResultPayloadData(
      {
        success: true,
        data: {
          output: 'ok',
          screenshot: 'shot',
          image_data: 'inline',
          screenshot_ref: 'existing-ref',
          screenshot_id: 'shot-id',
          capture_meta: { source_w: 1920, source_h: 1080 },
        },
      },
      'formatted',
    );

    expect(payload).toEqual({
      output: 'ok',
      llm_content: 'formatted',
    });
  });

  test('buildToolResultPayloadData includes screenshot_ref for computer-use tools and overrides with uploaded artifact id', () => {
    const payload = buildToolResultPayloadData(
      {
        success: true,
        data: {
          output: 'ok',
          screenshot_ref: 'old-ref',
          screenshot_id: 'shot-new',
          capture_meta: { source_w: 100, source_h: 100 },
        },
      },
      'formatted',
      {
        screenshotRef: 'new-ref',
        includeScreenshot: true,
        includeSystemState: true,
      },
    );

    expect(payload).toEqual({
      output: 'ok',
      screenshot_ref: 'new-ref',
      capture_meta: { source_w: 100, source_h: 100 },
      llm_content: 'formatted',
      system_state: {
        active_window: 'Unknown',
        mouse_position: 'Unknown',
      },
    });
    expect(payload).not.toHaveProperty('screenshot_id');
  });

  test('buildToolResultPayloadData includes system_state with fallback values when requested', () => {
    const payload = buildToolResultPayloadData(
      {
        success: true,
        data: {
          output: 'ok',
          system_state: {
            active_window: 'Editor',
          },
        },
      },
      'formatted',
      { includeSystemState: true },
    );

    expect(payload).toEqual({
      output: 'ok',
      llm_content: 'formatted',
      system_state: {
        active_window: 'Editor',
        mouse_position: 'Unknown',
      },
    });
  });

  test('buildToolResultPayloadData keeps screen_resolution in internal runtime state only', () => {
    const payload = buildToolResultPayloadData(
      {
        success: true,
        data: {
          output: 'ok',
          system_state: {
            active_window: 'Editor',
            mouse_position: '(10, 20)',
            screen_resolution: '1920x1080',
          },
        },
      },
      'formatted',
      { includeSystemState: true },
    );

    expect(payload).toEqual({
      output: 'ok',
      llm_content: 'formatted',
      system_state: {
        active_window: 'Editor',
        mouse_position: '(10, 20)',
      },
      system_state_internal: {
        active_window: 'Editor',
        mouse_position: '(10, 20)',
        screen_resolution: '1920x1080',
      },
    });
  });

});
