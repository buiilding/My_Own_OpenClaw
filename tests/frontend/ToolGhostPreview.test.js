import { buildToolGhostPreviewFromMessageText } from '../../frontend/src/renderer/features/chat/utils/toolGhostPreview';

describe('toolGhostPreview', () => {
  test('returns fallback preview for invalid JSON payload', () => {
    const preview = buildToolGhostPreviewFromMessageText('not-json');
    expect(preview).toEqual({
      label: 'Running tool action',
      hasTarget: false,
      hasRect: false,
      xRatio: 0.5,
      yRatio: 0.5,
      targetScale: 1,
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
  });
});
