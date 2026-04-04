export const CHATBOX_DRAG_START_THRESHOLD = 5;

const CHATBOX_CLOSE_BUMP_HEIGHT = 14;
const CHATBOX_CLOSE_BUMP_HALF_WIDTH = 22;
const CHATBOX_CLOSE_CORNER_RADIUS = 26;

function formatPathNumber(value) {
  return Number(value.toFixed(2));
}

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

export function buildChatboxPillClipPath({
  width,
  height,
  centerX,
}) {
  const safeWidth = Math.max(1, Number(width) || 0);
  const safeHeight = Math.max(1, Number(height) || 0);
  const cornerRadius = Math.min(CHATBOX_CLOSE_CORNER_RADIUS, safeWidth / 2, safeHeight / 2);
  const bodyTop = Math.min(CHATBOX_CLOSE_BUMP_HEIGHT, Math.max(0, safeHeight - cornerRadius - 1));
  const maxHalfWidth = Math.max(12, Math.min(CHATBOX_CLOSE_BUMP_HALF_WIDTH, ((safeWidth - (cornerRadius * 2)) / 2) - 8));
  const clampedCenterX = Math.min(
    safeWidth - cornerRadius - maxHalfWidth - 6,
    Math.max(cornerRadius + maxHalfWidth + 6, Number(centerX) || 0),
  );
  const leftShoulderX = clampedCenterX - maxHalfWidth;
  const rightShoulderX = clampedCenterX + maxHalfWidth;
  const curveInset = Math.min(16, maxHalfWidth * 0.72);
  const apexControlInset = Math.min(14, maxHalfWidth * 0.56);

  return `path("M ${formatPathNumber(cornerRadius)} ${formatPathNumber(bodyTop)} L ${formatPathNumber(leftShoulderX)} ${formatPathNumber(bodyTop)} C ${formatPathNumber(leftShoulderX + curveInset)} ${formatPathNumber(bodyTop)}, ${formatPathNumber(clampedCenterX - apexControlInset)} 0, ${formatPathNumber(clampedCenterX)} 0 C ${formatPathNumber(clampedCenterX + apexControlInset)} 0, ${formatPathNumber(rightShoulderX - curveInset)} ${formatPathNumber(bodyTop)}, ${formatPathNumber(rightShoulderX)} ${formatPathNumber(bodyTop)} L ${formatPathNumber(safeWidth - cornerRadius)} ${formatPathNumber(bodyTop)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 ${formatPathNumber(safeWidth)} ${formatPathNumber(bodyTop + cornerRadius)} L ${formatPathNumber(safeWidth)} ${formatPathNumber(safeHeight - cornerRadius)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 ${formatPathNumber(safeWidth - cornerRadius)} ${formatPathNumber(safeHeight)} L ${formatPathNumber(cornerRadius)} ${formatPathNumber(safeHeight)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 0 ${formatPathNumber(safeHeight - cornerRadius)} L 0 ${formatPathNumber(bodyTop + cornerRadius)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 ${formatPathNumber(cornerRadius)} ${formatPathNumber(bodyTop)} Z")`;
}

export function getChatboxPillClipHeight(height) {
  return (Math.max(0, Number(height) || 0)) + CHATBOX_CLOSE_BUMP_HEIGHT;
}
