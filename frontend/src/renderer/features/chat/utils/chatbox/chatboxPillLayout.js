export const CHATBOX_DRAG_START_THRESHOLD = 5;

export function createChatboxDragState() {
  return {
    isDragging: false,
    didDrag: false,
    startClientX: 0,
    startClientY: 0,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    lastTargetX: null,
    lastTargetY: null,
  };
}

export function startChatboxDrag(dragState, event, windowScreenX, windowScreenY) {
  const screenX = Math.round(Number(event?.screenX) || 0);
  const screenY = Math.round(Number(event?.screenY) || 0);

  dragState.isDragging = true;
  dragState.didDrag = false;
  dragState.startClientX = Math.round(Number(event?.clientX) || 0);
  dragState.startClientY = Math.round(Number(event?.clientY) || 0);
  dragState.pointerOffsetX = screenX - Math.round(Number(windowScreenX) || 0);
  dragState.pointerOffsetY = screenY - Math.round(Number(windowScreenY) || 0);
  dragState.lastTargetX = Math.round(Number(windowScreenX) || 0);
  dragState.lastTargetY = Math.round(Number(windowScreenY) || 0);
}

export function stopChatboxDrag(dragState) {
  dragState.isDragging = false;
  dragState.lastTargetX = null;
  dragState.lastTargetY = null;
}

export function getChatboxDragTarget(dragState, event) {
  if (!dragState?.isDragging) {
    return null;
  }

  const screenX = Math.round(Number(event?.screenX) || 0);
  const screenY = Math.round(Number(event?.screenY) || 0);
  const clientX = Math.round(Number(event?.clientX) || 0);
  const clientY = Math.round(Number(event?.clientY) || 0);
  const movedDistance = Math.abs(clientX - dragState.startClientX) + Math.abs(clientY - dragState.startClientY);

  if (movedDistance < CHATBOX_DRAG_START_THRESHOLD) {
    return null;
  }

  dragState.didDrag = true;

  const nextX = screenX - dragState.pointerOffsetX;
  const nextY = screenY - dragState.pointerOffsetY;
  if (nextX === dragState.lastTargetX && nextY === dragState.lastTargetY) {
    return null;
  }

  dragState.lastTargetX = nextX;
  dragState.lastTargetY = nextY;

  return { x: nextX, y: nextY };
}
