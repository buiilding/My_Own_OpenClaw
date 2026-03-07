function normalizeInteger(value, fallback = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }
  return Math.round(normalized);
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }
  const width = normalizeInteger(bounds.width);
  const height = normalizeInteger(bounds.height);
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    x: normalizeInteger(bounds.x),
    y: normalizeInteger(bounds.y),
    width,
    height,
  };
}

function resolveDesktopVirtualBounds(screen) {
  if (!screen || typeof screen.getAllDisplays !== 'function') {
    return null;
  }
  const displays = screen.getAllDisplays();
  if (!Array.isArray(displays) || displays.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const display of displays) {
    const bounds = normalizeBounds(display?.bounds);
    if (!bounds) {
      continue;
    }
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function createDisplayAffinity(display, options = {}) {
  if (!display || typeof display !== 'object') {
    return null;
  }
  const bounds = normalizeBounds(display.bounds);
  if (!bounds) {
    return null;
  }
  const workArea = normalizeBounds(display.workArea) || bounds;
  const desktopVirtualBounds = normalizeBounds(options.desktopVirtualBounds);
  const displayId = display.id;
  return {
    monitor_id: displayId === undefined || displayId === null ? null : String(displayId),
    bounds,
    workArea,
    desktopVirtualBounds,
  };
}

function resolvePrimaryDisplayAffinity(screen) {
  if (!screen || typeof screen.getPrimaryDisplay !== 'function') {
    return null;
  }
  return createDisplayAffinity(
    screen.getPrimaryDisplay(),
    { desktopVirtualBounds: resolveDesktopVirtualBounds(screen) },
  );
}

function resolveDisplayAffinityForBounds(screen, bounds) {
  if (!screen || typeof screen.getDisplayMatching !== 'function' || !bounds) {
    return resolvePrimaryDisplayAffinity(screen);
  }
  return (
    createDisplayAffinity(
      screen.getDisplayMatching(bounds),
      { desktopVirtualBounds: resolveDesktopVirtualBounds(screen) },
    )
    || resolvePrimaryDisplayAffinity(screen)
  );
}

function resolveDisplayAffinityForWindow(screen, targetWindow, { requireVisible = false } = {}) {
  if (!targetWindow || typeof targetWindow !== 'object') {
    return requireVisible ? null : resolvePrimaryDisplayAffinity(screen);
  }
  if (typeof targetWindow.isDestroyed === 'function' && targetWindow.isDestroyed()) {
    return requireVisible ? null : resolvePrimaryDisplayAffinity(screen);
  }
  if (requireVisible && typeof targetWindow.isVisible === 'function' && !targetWindow.isVisible()) {
    return null;
  }
  if (typeof targetWindow.getBounds !== 'function') {
    return requireVisible ? null : resolvePrimaryDisplayAffinity(screen);
  }
  return resolveDisplayAffinityForBounds(screen, targetWindow.getBounds());
}

function resolveDisplayAffinityForWebContents({
  BrowserWindow,
  screen,
  webContents,
  requireVisible = false,
}) {
  if (!BrowserWindow || typeof BrowserWindow.fromWebContents !== 'function' || !webContents) {
    return requireVisible ? null : resolvePrimaryDisplayAffinity(screen);
  }
  const targetWindow = BrowserWindow.fromWebContents(webContents);
  return resolveDisplayAffinityForWindow(screen, targetWindow, { requireVisible });
}

function resolveWindowForWebContents(BrowserWindow, webContents) {
  if (!BrowserWindow || typeof BrowserWindow.fromWebContents !== 'function' || !webContents) {
    return null;
  }
  return BrowserWindow.fromWebContents(webContents);
}

function resolveActiveSurfaceDisplayAffinity({
  BrowserWindow,
  screen,
  webContents,
  chatWindow = null,
  mainWindow = null,
  resolveWindowForWebContents: resolveSenderWindow = resolveWindowForWebContents,
  resolveDisplayAffinityForWindow: resolveWindowAffinity = resolveDisplayAffinityForWindow,
  resolveDisplayAffinityForWebContents: resolveWebContentsAffinity = resolveDisplayAffinityForWebContents,
  getActiveDisplayAffinity: getStoredAffinity = getActiveDisplayAffinity,
}) {
  if (webContents) {
    const senderWindow = resolveSenderWindow(BrowserWindow, webContents);
    const senderIsSurfaceWindow = Boolean(
      senderWindow
      && (
        senderWindow === chatWindow
        || senderWindow === mainWindow
      )
    );
    if (senderIsSurfaceWindow) {
      const visibleSenderDisplayAffinity = resolveWebContentsAffinity({
        BrowserWindow,
        screen,
        webContents,
        requireVisible: true,
      });
      if (visibleSenderDisplayAffinity) {
        return visibleSenderDisplayAffinity;
      }
    }
  }

  const visibleChatDisplayAffinity = chatWindow
    ? resolveWindowAffinity(screen, chatWindow, { requireVisible: true })
    : null;
  if (visibleChatDisplayAffinity) {
    return visibleChatDisplayAffinity;
  }

  const visibleMainDisplayAffinity = mainWindow
    ? resolveWindowAffinity(screen, mainWindow, { requireVisible: true })
    : null;
  if (visibleMainDisplayAffinity) {
    return visibleMainDisplayAffinity;
  }

  return getStoredAffinity();
}

function toScreenshotDisplayBounds(displayAffinity) {
  if (!displayAffinity || typeof displayAffinity !== 'object' || !displayAffinity.bounds) {
    return null;
  }
  const normalized = {
    ...displayAffinity.bounds,
    monitor_id: displayAffinity.monitor_id,
  };
  if (displayAffinity.desktopVirtualBounds) {
    normalized.desktop_virtual_bounds = { ...displayAffinity.desktopVirtualBounds };
  }
  return normalized;
}

function centerWindowOnDisplayWorkArea(targetWindow, displayAffinity) {
  if (
    !targetWindow
    || typeof targetWindow !== 'object'
    || !displayAffinity
    || typeof targetWindow.getSize !== 'function'
    || typeof targetWindow.setBounds !== 'function'
  ) {
    return false;
  }
  const workArea = displayAffinity.workArea || displayAffinity.bounds;
  const [windowWidthRaw, windowHeightRaw] = targetWindow.getSize();
  const windowWidth = Math.max(1, normalizeInteger(windowWidthRaw, 1000));
  const windowHeight = Math.max(1, normalizeInteger(windowHeightRaw, 700));
  const maxX = workArea.x + Math.max(0, workArea.width - windowWidth);
  const maxY = workArea.y + Math.max(0, workArea.height - windowHeight);
  const nextX = Math.min(
    maxX,
    Math.max(
      workArea.x,
      workArea.x + Math.round((workArea.width - windowWidth) / 2),
    ),
  );
  const nextY = Math.min(
    maxY,
    Math.max(
      workArea.y,
      workArea.y + Math.round((workArea.height - windowHeight) / 2),
    ),
  );
  targetWindow.setBounds({
    x: nextX,
    y: nextY,
    width: windowWidth,
    height: windowHeight,
  }, false);
  return true;
}

function fitWindowToDisplayWorkArea(targetWindow, displayAffinity) {
  if (
    !targetWindow
    || typeof targetWindow !== 'object'
    || !displayAffinity
    || typeof targetWindow.setBounds !== 'function'
  ) {
    return false;
  }
  const workArea = normalizeBounds(displayAffinity.workArea) || normalizeBounds(displayAffinity.bounds);
  if (!workArea) {
    return false;
  }
  targetWindow.setBounds(workArea, false);
  return true;
}

let activeDisplayAffinity = null;

function setActiveDisplayAffinity(displayAffinity) {
  activeDisplayAffinity = displayAffinity ? {
    monitor_id: displayAffinity.monitor_id ?? null,
    bounds: displayAffinity.bounds ? { ...displayAffinity.bounds } : null,
    workArea: displayAffinity.workArea ? { ...displayAffinity.workArea } : null,
    desktopVirtualBounds: displayAffinity.desktopVirtualBounds
      ? { ...displayAffinity.desktopVirtualBounds }
      : null,
  } : null;
}

function getActiveDisplayAffinity() {
  return activeDisplayAffinity ? {
    monitor_id: activeDisplayAffinity.monitor_id,
    bounds: activeDisplayAffinity.bounds ? { ...activeDisplayAffinity.bounds } : null,
    workArea: activeDisplayAffinity.workArea ? { ...activeDisplayAffinity.workArea } : null,
    desktopVirtualBounds: activeDisplayAffinity.desktopVirtualBounds
      ? { ...activeDisplayAffinity.desktopVirtualBounds }
      : null,
  } : null;
}

function syncActiveDisplayAffinityForWindow(screen, targetWindow) {
  const displayAffinity = resolveDisplayAffinityForWindow(
    screen,
    targetWindow,
    { requireVisible: true },
  );
  if (displayAffinity) {
    setActiveDisplayAffinity(displayAffinity);
  }
  return displayAffinity;
}

module.exports = {
  centerWindowOnDisplayWorkArea,
  fitWindowToDisplayWorkArea,
  getActiveDisplayAffinity,
  resolveActiveSurfaceDisplayAffinity,
  resolveDisplayAffinityForWindow,
  resolveDisplayAffinityForWebContents,
  resolveWindowForWebContents,
  setActiveDisplayAffinity,
  syncActiveDisplayAffinityForWindow,
  toScreenshotDisplayBounds,
};
