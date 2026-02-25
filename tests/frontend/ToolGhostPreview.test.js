import { buildToolGhostPreviewFromMessageText } from '../../frontend/src/renderer/features/chat/utils/toolGhostPreview';

describe('toolGhostPreview', () => {
  test('returns fallback preview for invalid JSON payload', () => {
    const preview = buildToolGhostPreviewFromMessageText('not-json');
    expect(preview).toEqual({
      label: 'Running tool action',
      hasTarget: false,
      hasRect: false,
      isMouseClick: false,
      isScrollAction: false,
      isMotionAction: false,
      showsTargetRipple: false,
      xRatio: 0.5,
      yRatio: 0.5,
      targetScale: 1,
      targetDisplayWidth: null,
      targetDisplayHeight: null,
      rawTargetX: null,
      rawTargetY: null,
    });
  });

  test('extracts explanation label for single tool payload', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'mouse_control',
      args: { explanation: 'Clicking Chrome icon' },
    }));

    expect(preview.label).toBe('Clicking Chrome icon');
    expect(preview.hasTarget).toBe(false);
  });

  test('extracts explanation label from model-facing arguments payload shape', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'mouse_control',
      arguments: { action: 'click', explanation: 'Clicking submit button' },
    }));

    expect(preview.label).toBe('Clicking submit button');
    expect(preview.isMouseClick).toBe(true);
  });

  test('treats direct click tool names as click-like ghost actions', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'click',
      arguments: { explanation: 'Clicking Chrome icon', x: 640, y: 360 },
      metadata: {
        coordinate_contract: {
          target_display_size: [1280, 720],
        },
      },
    }));

    expect(preview.isMouseClick).toBe(true);
    expect(preview.isMotionAction).toBe(true);
    expect(preview.showsTargetRipple).toBe(true);
  });

  test('treats browser action click with coordinate_x/y as click-like targeted motion', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'browser',
      arguments: {
        action: 'click',
        explanation: 'Clicking some text',
        coordinate_x: 320,
        coordinate_y: 240,
      },
      metadata: {
        coordinate_contract: {
          target_display_size: [640, 480],
        },
      },
    }));

    expect(preview.isMouseClick).toBe(true);
    expect(preview.hasTarget).toBe(true);
    expect(preview.xRatio).toBeCloseTo(0.5);
    expect(preview.yRatio).toBeCloseTo(0.5);
  });

  test('extracts explanation label for scroll tool payloads', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'scroll_control',
      arguments: { explanation: 'Scroll down to pricing table', x: 480, y: 320 },
      metadata: {
        coordinate_contract: {
          target_display_size: [1200, 800],
        },
      },
    }));

    expect(preview.label).toBe('Scroll down to pricing table');
    expect(preview.isScrollAction).toBe(true);
    expect(preview.isMotionAction).toBe(true);
    expect(preview.showsTargetRipple).toBe(true);
  });

  test('derives target ratios from coordinate contract metadata', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'mouse_control',
      args: { explanation: 'Clicking Save' },
      metadata: {
        coordinate_contract: {
          target_display_size: [1920, 1080],
          normalized_coordinates: { x: 1600, y: 900 },
        },
      },
    }));

    expect(preview.hasTarget).toBe(true);
    expect(preview.xRatio).toBeCloseTo(1600 / 1920);
    expect(preview.yRatio).toBeCloseTo(900 / 1080);
    expect(preview.targetDisplayWidth).toBe(1920);
    expect(preview.targetDisplayHeight).toBe(1080);
  });

  test('keeps raw target coordinates when coordinate contract lacks display size', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'mouse_control',
      arguments: { action: 'click', x: 900, y: 800 },
      metadata: {
        coordinate_contract: {
          target_display_size: null,
          normalized_coordinates: { x: 900, y: 800 },
        },
      },
    }));

    expect(preview.hasTarget).toBe(false);
    expect(preview.rawTargetX).toBe(900);
    expect(preview.rawTargetY).toBe(800);
  });

  test('selects first bundle step with coordinates when available', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      bundle_id: 'bundle-1',
      tools: [
        {
          name: 'wait',
          args: { wait_seconds: 1 },
        },
        {
          name: 'mouse_control',
          args: { explanation: 'Clicking Compose', x: 300, y: 200 },
          metadata: {
            coordinate_contract: {
              target_display_size: [1000, 1000],
              normalized_coordinates: { x: 300, y: 200 },
            },
          },
        },
      ],
    }));

    expect(preview.label).toBe('Clicking Compose');
    expect(preview.hasTarget).toBe(true);
    expect(preview.xRatio).toBeCloseTo(0.3);
    expect(preview.yRatio).toBeCloseTo(0.2);
  });

  test('derives target scale when target_rect metadata is present', () => {
    const preview = buildToolGhostPreviewFromMessageText(JSON.stringify({
      name: 'mouse_control',
      args: { explanation: 'Clicking big panel' },
      metadata: {
        target_rect: { x: 100, y: 200, width: 500, height: 350 },
        coordinate_contract: {
          target_display_size: [1920, 1080],
        },
      },
    }));

    expect(preview.hasTarget).toBe(true);
    expect(preview.hasRect).toBe(true);
    expect(preview.targetScale).toBeGreaterThan(1);
    expect(preview.rectLeftRatio).toBeCloseTo(100 / 1920);
    expect(preview.rectTopRatio).toBeCloseTo(200 / 1080);
    expect(preview.rectWidthRatio).toBeCloseTo(500 / 1920);
    expect(preview.rectHeightRatio).toBeCloseTo(350 / 1080);
  });
});
