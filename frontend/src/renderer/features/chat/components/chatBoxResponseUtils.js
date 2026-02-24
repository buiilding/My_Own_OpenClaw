import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../constants/toolGhostRuntime';

const TOOL_GHOST_OFFSET_X_SPAN = 52;
const TOOL_GHOST_OFFSET_Y_SPAN = 34;

export function findLastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === 'user') {
      return i;
    }
  }
  return -1;
}

export function findLatestMessageAfterUser(messages, lastUserIndex, allowedTypes) {
  if (lastUserIndex < 0) {
    return null;
  }
  for (let i = messages.length - 1; i > lastUserIndex; i -= 1) {
    const message = messages[i];
    if (message.sender !== 'assistant') {
      continue;
    }
    if (!message.text) {
      continue;
    }
    if (!allowedTypes.has(message.type)) {
      continue;
    }
    return message;
  }
  return null;
}

export function findLatestToolCallAfterUser(messages, lastUserIndex) {
  if (lastUserIndex < 0) {
    return null;
  }
  for (let i = messages.length - 1; i > lastUserIndex; i -= 1) {
    const message = messages[i];
    if (message.sender !== 'assistant' || message.type !== 'tool-call') {
      continue;
    }
    if (!message.text) {
      continue;
    }
    return message;
  }
  return null;
}

export function buildToolGhostTrackStyle(toolGhostPreview, toolGhostStartRatio, effectiveTargetRatio) {
  if (!effectiveTargetRatio) {
    return null;
  }
  const startXOffset = Math.round((toolGhostStartRatio.xRatio - 0.5) * TOOL_GHOST_OFFSET_X_SPAN);
  const startYOffset = Math.round((toolGhostStartRatio.yRatio - 0.5) * TOOL_GHOST_OFFSET_Y_SPAN);
  const endXOffset = Math.round((effectiveTargetRatio.xRatio - 0.5) * TOOL_GHOST_OFFSET_X_SPAN);
  const endYOffset = Math.round((effectiveTargetRatio.yRatio - 0.5) * TOOL_GHOST_OFFSET_Y_SPAN);
  const style = {
    '--ghost-start-offset-x': `${startXOffset}px`,
    '--ghost-start-offset-y': `${startYOffset}px`,
    '--ghost-end-offset-x': `${endXOffset}px`,
    '--ghost-end-offset-y': `${endYOffset}px`,
    '--ghost-offset-x': `${endXOffset}px`,
    '--ghost-offset-y': `${endYOffset}px`,
    '--ghost-target-scale': `${toolGhostPreview.targetScale}`,
    '--ghost-motion-duration': `${TOOL_GHOST_CLICK_SYNC_DELAY_MS}ms`,
  };
  if (
    toolGhostPreview.hasRect
    && Number.isFinite(toolGhostPreview.rectLeftRatio)
    && Number.isFinite(toolGhostPreview.rectTopRatio)
    && Number.isFinite(toolGhostPreview.rectWidthRatio)
    && Number.isFinite(toolGhostPreview.rectHeightRatio)
  ) {
    style['--ghost-rect-left'] = `${toolGhostPreview.rectLeftRatio * 100}%`;
    style['--ghost-rect-top'] = `${toolGhostPreview.rectTopRatio * 100}%`;
    style['--ghost-rect-width'] = `${toolGhostPreview.rectWidthRatio * 100}%`;
    style['--ghost-rect-height'] = `${toolGhostPreview.rectHeightRatio * 100}%`;
  }
  return style;
}
