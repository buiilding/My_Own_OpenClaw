import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../../frontend/src/renderer/features/chat/constants/toolGhostRuntime';
import { buildToolGhostTrackStyle } from '../../frontend/src/renderer/features/chat/components/chatBoxResponseUtils';

function toPxNumber(value) {
  return Number.parseInt((value || '').replace('px', ''), 10);
}

describe('chatbox ghost click motion style', () => {
  test('builds different start and end offsets for visible travel', () => {
    const style = buildToolGhostTrackStyle(
      {
        hasRect: false,
        rectLeftRatio: undefined,
        rectTopRatio: undefined,
        rectWidthRatio: undefined,
        rectHeightRatio: undefined,
        targetScale: 1,
      },
      { xRatio: 0.1, yRatio: 0.2 },
      { xRatio: 0.9, yRatio: 0.8 },
    );

    expect(style).toBeTruthy();
    const startX = toPxNumber(style['--ghost-start-offset-x']);
    const startY = toPxNumber(style['--ghost-start-offset-y']);
    const endX = toPxNumber(style['--ghost-end-offset-x']);
    const endY = toPxNumber(style['--ghost-end-offset-y']);
    expect(startX).not.toBe(endX);
    expect(startY).not.toBe(endY);
  });

  test('uses full click ghost timeline duration', () => {
    const style = buildToolGhostTrackStyle(
      {
        hasRect: false,
        rectLeftRatio: undefined,
        rectTopRatio: undefined,
        rectWidthRatio: undefined,
        rectHeightRatio: undefined,
        targetScale: 1,
      },
      { xRatio: 0.4, yRatio: 0.4 },
      { xRatio: 0.6, yRatio: 0.6 },
    );

    expect(style['--ghost-motion-duration']).toBe(`${TOOL_GHOST_CLICK_SYNC_DELAY_MS}ms`);
  });
});
