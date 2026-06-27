/**
 * Covers chat box pill layout. behavior in the frontend test suite.
 */

import { DesktopChatboxLayoutRuntime } from '../../src/renderer/app/runtime/desktopChatboxLayoutRuntime';

describe('chatbox pill layout utils', () => {
  const {
    createChatboxDragState,
    getChatboxDragTarget,
    getChatboxCloseBumpHeight,
    startChatboxDrag,
    startChatboxDragFromWindow,
    stopChatboxDrag,
  } = DesktopChatboxLayoutRuntime;

  test('creates the expected initial drag state', () => {
    expect(createChatboxDragState()).toEqual({
      isDragging: false,
      didDrag: false,
      startClientX: 0,
      startClientY: 0,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      lastTargetX: null,
      lastTargetY: null,
    });
  });

  test('tracks drag start and resolves drag targets after the threshold', () => {
    const dragState = createChatboxDragState();

    startChatboxDrag(dragState, {
      clientX: 10,
      clientY: 10,
      screenX: 100,
      screenY: 100,
    }, 90, 90);

    expect(dragState).toMatchObject({
      isDragging: true,
      didDrag: false,
      startClientX: 10,
      startClientY: 10,
      pointerOffsetX: 10,
      pointerOffsetY: 10,
      lastTargetX: 90,
      lastTargetY: 90,
    });

    expect(getChatboxDragTarget(dragState, {
      clientX: 12,
      clientY: 12,
      screenX: 102,
      screenY: 102,
    })).toBeNull();

    expect(getChatboxDragTarget(dragState, {
      clientX: 20,
      clientY: 18,
      screenX: 130,
      screenY: 128,
    })).toEqual({ x: 120, y: 118 });

    expect(dragState.didDrag).toBe(true);
    expect(getChatboxDragTarget(dragState, {
      clientX: 20,
      clientY: 18,
      screenX: 130,
      screenY: 128,
    })).toBeNull();
  });

  test('clears active drag targeting on stop', () => {
    const dragState = createChatboxDragState();
    startChatboxDrag(dragState, {
      clientX: 10,
      clientY: 10,
      screenX: 100,
      screenY: 100,
    }, 90, 90);

    stopChatboxDrag(dragState);

    expect(dragState.isDragging).toBe(false);
    expect(dragState.lastTargetX).toBeNull();
    expect(dragState.lastTargetY).toBeNull();
  });

  test('starts drag tracking from current window coordinates', () => {
    const dragState = createChatboxDragState();

    startChatboxDragFromWindow(dragState, {
      clientX: 10,
      clientY: 10,
      screenX: 100,
      screenY: 100,
    }, {
      screenX: 90,
      screenY: 88,
    });

    expect(dragState).toMatchObject({
      isDragging: true,
      pointerOffsetX: 10,
      pointerOffsetY: 12,
      lastTargetX: 90,
      lastTargetY: 88,
    });
  });

  test('exposes the close badge bump height', () => {
    expect(getChatboxCloseBumpHeight()).toBe(14);
  });
});
