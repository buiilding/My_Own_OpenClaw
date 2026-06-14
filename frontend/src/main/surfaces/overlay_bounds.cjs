/**
 * Provides the overlay bounds module for the Electron main process.
 */

const COMPACT_RESPONSE_HEIGHT_THRESHOLD = 56;
const COMPACT_RESPONSE_HOVER_OFFSET = 6;

function normalizeRoundedFinite(value, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    return required ? null : 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed);
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }
  const width = normalizeRoundedFinite(bounds.width, { required: true });
  const height = normalizeRoundedFinite(bounds.height, { required: true });
  const x = normalizeRoundedFinite(bounds.x);
  const y = normalizeRoundedFinite(bounds.y);
  if (
    width === null
    || height === null
    || x === null
    || y === null
    || width <= 0
    || height <= 0
  ) {
    return null;
  }
  return {
    x,
    y,
    width,
    height,
  };
}

function normalizePositiveDimension(value) {
  const rounded = normalizeRoundedFinite(value, { required: true });
  return rounded !== null && rounded > 0 ? rounded : 1;
}

function resolvePrimaryWorkArea(screen) {
  if (!screen || typeof screen.getPrimaryDisplay !== 'function') {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const display = screen.getPrimaryDisplay();
  const workArea = normalizeBounds(display?.workArea);
  if (workArea) {
    return workArea;
  }
  const bounds = normalizeBounds(display?.bounds);
  if (bounds) {
    return bounds;
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

function resolveTargetWorkArea({ screen, displayAffinity = null }) {
  const preferredWorkArea = normalizeBounds(displayAffinity?.workArea);
  if (preferredWorkArea) {
    return preferredWorkArea;
  }
  const preferredBounds = normalizeBounds(displayAffinity?.bounds);
  if (preferredBounds) {
    return preferredBounds;
  }
  return resolvePrimaryWorkArea(screen);
}

function clampToRange(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function getChatWindowBounds({
  screen,
  width,
  height,
  displayAffinity = null,
  marginBottom = 24,
  targetX = null,
}) {
  const normalizedWidth = normalizePositiveDimension(width);
  const normalizedHeight = normalizePositiveDimension(height);
  const workArea = resolveTargetWorkArea({ screen, displayAffinity });
  const maxX = workArea.x + Math.max(0, workArea.width - normalizedWidth);
  const centeredX = Math.round(workArea.x + (workArea.width - normalizedWidth) / 2);
  const hasManualTargetX = targetX !== null && targetX !== undefined && Number.isFinite(Number(targetX));
  const x = hasManualTargetX
    ? clampToRange(Math.round(Number(targetX)), workArea.x, maxX)
    : centeredX;
  const y = Math.round(workArea.y + workArea.height - normalizedHeight - marginBottom);
  return { x, y, width: normalizedWidth, height: normalizedHeight };
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
  displayAffinity = null,
  chatBounds = null,
  gap = 10,
  compactHover = false,
}) {
  if (!chatBounds) {
    return getChatWindowBounds({ screen, width, height, displayAffinity });
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
  displayAffinity = null,
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
      displayAffinity,
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
