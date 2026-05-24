function normalizeTargetDisplayAffinity(targetDisplayAffinity) {
  return (
    targetDisplayAffinity
    && typeof targetDisplayAffinity === 'object'
    && !Array.isArray(targetDisplayAffinity)
  )
    ? targetDisplayAffinity
    : null;
}

function normalizeChatSurfaceWindowOptions(options = {}) {
  const reason = typeof options?.reason === 'string' && options.reason.trim()
    ? { reason: options.reason.trim().toLowerCase() }
    : {};
  return {
    focus: options?.focus !== false,
    restoreResponseOverlay: options?.restoreResponseOverlay === true,
    targetDisplayAffinity: normalizeTargetDisplayAffinity(options?.targetDisplayAffinity),
    ...reason,
  };
}

function normalizeMainSurfaceWindowOptions(options = {}) {
  const open = typeof options?.open === 'string'
    ? options.open.trim().toLowerCase()
    : '';
  return {
    focus: options?.focus !== false,
    maximize: options?.maximize === true,
    open,
    targetDisplayAffinity: normalizeTargetDisplayAffinity(options?.targetDisplayAffinity),
  };
}

module.exports = {
  normalizeChatSurfaceWindowOptions,
  normalizeMainSurfaceWindowOptions,
};
