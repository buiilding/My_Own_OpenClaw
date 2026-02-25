import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../constants/toolGhostRuntime';

const TOOL_GHOST_MOVE_DURATION_MS = 500;
const RATIO_EPSILON = 0.001;

function clampRatio(value) {
  return Math.min(1, Math.max(0, value));
}

function toCssPercent(value) {
  return `${clampRatio(value) * 100}%`;
}

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
  const startRatio = toolGhostStartRatio || { xRatio: 0.5, yRatio: 0.5 };
  const targetRatio = effectiveTargetRatio || startRatio;
  const motionDuration = toolGhostPreview.isMouseClick
    ? TOOL_GHOST_CLICK_SYNC_DELAY_MS
    : TOOL_GHOST_MOVE_DURATION_MS;
  const style = {
    '--ghost-start-left': toCssPercent(startRatio.xRatio),
    '--ghost-start-top': toCssPercent(startRatio.yRatio),
    '--ghost-end-left': toCssPercent(targetRatio.xRatio),
    '--ghost-end-top': toCssPercent(targetRatio.yRatio),
    '--ghost-ripple-left': toCssPercent(targetRatio.xRatio),
    '--ghost-ripple-top': toCssPercent(targetRatio.yRatio),
    '--ghost-target-scale': `${toolGhostPreview.targetScale}`,
    '--ghost-motion-duration': `${motionDuration}ms`,
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

export function hasToolGhostMotion(toolGhostStartRatio, effectiveTargetRatio) {
  if (!effectiveTargetRatio) {
    return false;
  }
  const startRatio = toolGhostStartRatio || { xRatio: 0.5, yRatio: 0.5 };
  return (
    Math.abs((startRatio.xRatio || 0.5) - (effectiveTargetRatio.xRatio || 0.5)) > RATIO_EPSILON
    || Math.abs((startRatio.yRatio || 0.5) - (effectiveTargetRatio.yRatio || 0.5)) > RATIO_EPSILON
  );
}
