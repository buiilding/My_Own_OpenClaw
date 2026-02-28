const COMPACT_RESPONSE_HEIGHT_THRESHOLD = 56;
const COMPACT_RESPONSE_HOVER_OFFSET = 6;

function resolvePrimaryWorkArea(screen) {
  if (!screen || typeof screen.getPrimaryDisplay !== 'function') {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const display = screen.getPrimaryDisplay();
  if (display?.workArea) {
    return display.workArea;
  }
  if (display?.bounds) {
    return display.bounds;
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

function getChatWindowBounds({
  screen,
  width,
  height,
  marginBottom = 24,
}) {
  const workArea = resolvePrimaryWorkArea(screen);
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + workArea.height - height - marginBottom);
  return { x, y, width, height };
}

function resolveResponseGap({ gap = 10, height, compactHover = false }) {
  const normalizedGap = Number.isFinite(Number(gap)) ? Number(gap) : 10;
  const normalizedHeight = Math.max(0, Math.round(Number(height) || 0));

  if (
    compactHover
    || (normalizedHeight > 0 && normalizedHeight <= COMPACT_RESPONSE_HEIGHT_THRESHOLD)
  ) {
    // Keep compact awaiting indicators visually "hovering" over the chat pill
    // instead of floating far above due strict top anchoring.
    return normalizedGap - COMPACT_RESPONSE_HOVER_OFFSET;
  }

  return normalizedGap;
}

function getResponseWindowBounds({
  screen,
  width,
  height,
  chatBounds = null,
  gap = 10,
  compactHover = false,
}) {
  if (!chatBounds) {
    return getChatWindowBounds({ screen, width, height });
  }
  const resolvedGap = resolveResponseGap({ gap, height, compactHover });
  return {
    x: Math.round(chatBounds.x + (chatBounds.width - width) / 2),
    y: Math.round(chatBounds.y - resolvedGap - height),
    width,
    height,
  };
}

function getContextLabelWindowBounds({
  screen,
  chatBounds = null,
  labelWidth,
  labelHeight,
  offsetX,
  gapAbove,
}) {
  if (!chatBounds) {
    const fallback = getChatWindowBounds({
      screen,
      width: labelWidth,
      height: labelHeight,
    });
    return {
      x: fallback.x,
      y: fallback.y - labelHeight - gapAbove,
      width: labelWidth,
      height: labelHeight,
    };
  }

  return {
    x: chatBounds.x + offsetX,
    y: chatBounds.y - labelHeight - gapAbove,
    width: labelWidth,
    height: labelHeight,
  };
}

module.exports = {
  getChatWindowBounds,
  getResponseWindowBounds,
  getContextLabelWindowBounds,
};
