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

function getResponseWindowBounds({
  screen,
  width,
  height,
  chatBounds = null,
  gap = 10,
}) {
  if (!chatBounds) {
    return getChatWindowBounds({ screen, width, height });
  }
  return {
    x: Math.round(chatBounds.x + (chatBounds.width - width) / 2),
    y: Math.round(chatBounds.y - gap - height),
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
