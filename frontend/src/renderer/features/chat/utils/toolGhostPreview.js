const DEFAULT_TOOL_GHOST_LABEL = 'Running tool action';
const DEFAULT_GHOST_PREVIEW = Object.freeze({
  label: DEFAULT_TOOL_GHOST_LABEL,
  hasTarget: false,
  xRatio: 0.5,
  yRatio: 0.5,
});
const TOOL_LABEL_MAX_LENGTH = 120;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseSizeTuple(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const width = toFiniteNumber(value[0]);
    const height = toFiniteNumber(value[1]);
    if (width && height && width > 0 && height > 0) {
      return { width, height };
    }
  }

  if (value && typeof value === 'object') {
    const width = toFiniteNumber(value.width);
    const height = toFiniteNumber(value.height);
    if (width && height && width > 0 && height > 0) {
      return { width, height };
    }
  }

  return null;
}

function normalizeToolEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null;
  }

  const name = typeof rawEntry.name === 'string' ? rawEntry.name.trim() : '';
  const args = (
    rawEntry.args && typeof rawEntry.args === 'object' && !Array.isArray(rawEntry.args)
  ) ? rawEntry.args : {};
  const metadata = (
    rawEntry.metadata && typeof rawEntry.metadata === 'object' && !Array.isArray(rawEntry.metadata)
  ) ? rawEntry.metadata : {};

  return { name, args, metadata };
}

function extractToolEntries(parsedPayload) {
  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    return [];
  }

  if (typeof parsedPayload.name === 'string') {
    const entry = normalizeToolEntry(parsedPayload);
    return entry ? [entry] : [];
  }

  if (!Array.isArray(parsedPayload.tools)) {
    return [];
  }

  const entries = [];
  for (const toolEntry of parsedPayload.tools) {
    const normalized = normalizeToolEntry(toolEntry);
    if (normalized) {
      entries.push(normalized);
    }
  }
  return entries;
}

function resolveToolLabel(entry) {
  const explanation = typeof entry?.args?.explanation === 'string'
    ? entry.args.explanation.trim()
    : '';
  if (explanation) {
    return explanation.slice(0, TOOL_LABEL_MAX_LENGTH);
  }

  const waitSeconds = toFiniteNumber(entry?.args?.wait_seconds);
  if (entry?.name && waitSeconds !== null) {
    return `${entry.name} (wait ${waitSeconds}s)`;
  }

  if (entry?.name) {
    return `Running ${entry.name}`;
  }

  return DEFAULT_TOOL_GHOST_LABEL;
}

function resolveToolTargetPoint(entry) {
  const coordinateContract = (
    entry?.metadata?.coordinate_contract
      && typeof entry.metadata.coordinate_contract === 'object'
      && !Array.isArray(entry.metadata.coordinate_contract)
  ) ? entry.metadata.coordinate_contract : null;

  const normalizedCoordinates = (
    coordinateContract?.normalized_coordinates
      && typeof coordinateContract.normalized_coordinates === 'object'
      && !Array.isArray(coordinateContract.normalized_coordinates)
  ) ? coordinateContract.normalized_coordinates : null;

  const x = toFiniteNumber(normalizedCoordinates?.x) ?? toFiniteNumber(entry?.args?.x);
  const y = toFiniteNumber(normalizedCoordinates?.y) ?? toFiniteNumber(entry?.args?.y);
  if (x === null || y === null) {
    return null;
  }

  const size = parseSizeTuple(coordinateContract?.target_display_size)
    || parseSizeTuple(coordinateContract?.source_image_size);
  if (!size) {
    return null;
  }

  return {
    xRatio: clamp(x / size.width, 0, 1),
    yRatio: clamp(y / size.height, 0, 1),
  };
}

export function buildToolGhostPreviewFromMessageText(messageText) {
  if (!messageText) {
    return DEFAULT_GHOST_PREVIEW;
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(messageText);
  } catch (_error) {
    return DEFAULT_GHOST_PREVIEW;
  }

  const entries = extractToolEntries(parsedPayload);
  if (entries.length === 0) {
    return DEFAULT_GHOST_PREVIEW;
  }

  const scored = entries.map((entry) => ({
    entry,
    targetPoint: resolveToolTargetPoint(entry),
  }));
  const selected = scored.find((item) => item.targetPoint) || scored[0];
  const label = resolveToolLabel(selected.entry);

  if (!selected.targetPoint) {
    return {
      label,
      hasTarget: false,
      xRatio: DEFAULT_GHOST_PREVIEW.xRatio,
      yRatio: DEFAULT_GHOST_PREVIEW.yRatio,
    };
  }

  return {
    label,
    hasTarget: true,
    xRatio: selected.targetPoint.xRatio,
    yRatio: selected.targetPoint.yRatio,
  };
}

