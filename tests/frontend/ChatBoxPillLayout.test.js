import {
  createChatboxDragState,
  getChatboxDragTarget,
  getChatboxCloseBumpHeight,
  startChatboxDrag,
  stopChatboxDrag,
} from '../../frontend/src/renderer/features/chat/utils/chatbox/chatboxPillLayout';

describe('chatbox pill layout utils', () => {
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

  test('exposes the close badge bump height', () => {
    expect(getChatboxCloseBumpHeight()).toBe(14);
  });
});
