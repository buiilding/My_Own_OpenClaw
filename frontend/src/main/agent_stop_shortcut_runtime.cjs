const ACTIVE_AGENT_LOOP_STOP_PHASES = new Set([
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
]);
const shortcutCatalog = require('../shared/agent_stop_shortcut_catalog.json');

function isAgentLoopStopShortcutPhase(phase) {
  return ACTIVE_AGENT_LOOP_STOP_PHASES.has(phase);
}

function resolveShortcutPlatformKey(platform = process.platform) {
  if (platform === 'win32' || platform === 'darwin') {
    return platform;
  }
  return 'linux';
}

function getSupportedGlobalAgentStopShortcuts(platform = process.platform) {
  return shortcutCatalog[resolveShortcutPlatformKey(platform)] || shortcutCatalog.linux;
}

function normalizeGlobalAgentStopAccelerator(
  accelerator,
  platform = process.platform,
) {
  const shortcuts = getSupportedGlobalAgentStopShortcuts(platform);
  const normalizedAccelerator = typeof accelerator === 'string' ? accelerator.trim() : '';
  const matchedShortcut = shortcuts.find((shortcut) => shortcut.accelerator === normalizedAccelerator);
  return matchedShortcut?.accelerator || shortcuts[0]?.accelerator || 'CommandOrControl+Shift+Escape';
}

function resolveGlobalAgentStopAccelerator(
  platform = process.platform,
  accelerator = null,
) {
  return normalizeGlobalAgentStopAccelerator(accelerator, platform);
}

function buildRegistrationCandidates(
  requestedAccelerator,
  platform = process.platform,
) {
  const supportedAccelerators = getSupportedGlobalAgentStopShortcuts(platform)
    .map((shortcut) => shortcut?.accelerator)
    .filter((value) => typeof value === 'string' && value.length > 0);
  const normalizedRequested = normalizeGlobalAgentStopAccelerator(
    requestedAccelerator,
    platform,
  );
  return [
    normalizedRequested,
    ...supportedAccelerators.filter((value) => value !== normalizedRequested),
  ];
}

function initializeAgentStopShortcutRuntime(deps = {}) {
  const {
    globalShortcut,
    accelerator = null,
    platform = process.platform,
    onStop = () => {},
    onStatusChange = null,
    warn = console.warn,
  } = deps;

  let enabled = false;
  let registered = false;
  let requestedAccelerator = resolveGlobalAgentStopAccelerator(platform, accelerator);
  let resolvedAccelerator = requestedAccelerator;
  let registeredAccelerator = null;
  let registrationFailed = false;
  let lastStatusKey = null;

  function buildStatus() {
    return {
      enabled,
      requestedAccelerator,
      resolvedAccelerator,
      registered,
      registeredAccelerator,
      registrationFailed,
      usingFallback: (
        !registrationFailed
        && typeof resolvedAccelerator === 'string'
        && resolvedAccelerator.length > 0
        && resolvedAccelerator !== requestedAccelerator
      ),
      supportedAccelerators: getSupportedGlobalAgentStopShortcuts(platform)
        .map((shortcut) => shortcut?.accelerator)
        .filter((value) => typeof value === 'string' && value.length > 0),
    };
  }

  function emitStatusChange() {
    const nextStatus = buildStatus();
    const nextStatusKey = JSON.stringify({
      enabled: nextStatus.enabled,
      requestedAccelerator: nextStatus.requestedAccelerator,
      resolvedAccelerator: nextStatus.resolvedAccelerator,
      registered: nextStatus.registered,
      registeredAccelerator: nextStatus.registeredAccelerator,
      registrationFailed: nextStatus.registrationFailed,
      usingFallback: nextStatus.usingFallback,
      supportedAccelerators: nextStatus.supportedAccelerators,
    });
    if (nextStatusKey === lastStatusKey) {
      return;
    }
    lastStatusKey = nextStatusKey;
    if (typeof onStatusChange === 'function') {
      onStatusChange(nextStatus);
    }
  }

  function unregister() {
    if (!registered || !globalShortcut || typeof globalShortcut.unregister !== 'function') {
      registered = false;
      registeredAccelerator = null;
      emitStatusChange();
      return;
    }
    globalShortcut.unregister(registeredAccelerator);
    registered = false;
    registeredAccelerator = null;
    emitStatusChange();
  }

  function ensureRegistered() {
    if (registered) {
      return true;
    }
    if (!globalShortcut || typeof globalShortcut.register !== 'function') {
      registrationFailed = true;
      registered = false;
      registeredAccelerator = null;
      emitStatusChange();
      return false;
    }

    const shortcutHandler = () => {
      if (!enabled) {
        return;
      }
      onStop();
    };
    const candidateAccelerators = buildRegistrationCandidates(
      requestedAccelerator,
      platform,
    );

    for (const candidateAccelerator of candidateAccelerators) {
      const didRegister = globalShortcut.register(candidateAccelerator, shortcutHandler);
      if (!didRegister) {
        continue;
      }
      registered = true;
      registeredAccelerator = candidateAccelerator;
      resolvedAccelerator = candidateAccelerator;
      registrationFailed = false;
      if (candidateAccelerator !== requestedAccelerator) {
        warn(
          `[Main] Requested global stop shortcut unavailable; ` +
          `using fallback: ${candidateAccelerator} (requested ${requestedAccelerator})`,
        );
      }
      emitStatusChange();
      return true;
    }

    registered = false;
    registeredAccelerator = null;
    resolvedAccelerator = requestedAccelerator;
    registrationFailed = true;
    warn(
      `[Main] Failed to register global stop shortcut. Tried: ${candidateAccelerators.join(', ')}`,
    );
    emitStatusChange();
    return false;
  }

  function setAccelerator(nextAccelerator) {
    const normalizedAccelerator = normalizeGlobalAgentStopAccelerator(nextAccelerator, platform);
    if (normalizedAccelerator === requestedAccelerator) {
      return resolvedAccelerator;
    }

    const previousRequestedAccelerator = requestedAccelerator;
    const previousResolvedAccelerator = resolvedAccelerator;
    const previousRegistrationFailed = registrationFailed;
    const wasEnabled = enabled;
    unregister();
    requestedAccelerator = normalizedAccelerator;
    resolvedAccelerator = normalizedAccelerator;
    registrationFailed = false;

    if (wasEnabled && !ensureRegistered()) {
      const hadPreviousWorkingAccelerator = (
        previousRegistrationFailed !== true
        && typeof previousResolvedAccelerator === 'string'
        && previousResolvedAccelerator.length > 0
      );
      if (hadPreviousWorkingAccelerator) {
        requestedAccelerator = previousRequestedAccelerator;
        resolvedAccelerator = previousResolvedAccelerator;
        registrationFailed = false;
        ensureRegistered();
      }
    }

    emitStatusChange();
    return resolvedAccelerator;
  }

  function setEnabled(nextEnabled) {
    const shouldEnable = nextEnabled === true;
    enabled = shouldEnable;
    if (shouldEnable) {
      ensureRegistered();
      return;
    }
    unregister();
  }

  function dispose() {
    enabled = false;
    unregister();
  }

  return {
    dispose,
    getAccelerator: () => resolvedAccelerator,
    isEnabled: () => enabled,
    isRegistered: () => registered,
    getStatus: buildStatus,
    setAccelerator,
    setEnabled,
  };
}

module.exports = {
  ACTIVE_AGENT_LOOP_STOP_PHASES,
  getSupportedGlobalAgentStopShortcuts,
  initializeAgentStopShortcutRuntime,
  isAgentLoopStopShortcutPhase,
  normalizeGlobalAgentStopAccelerator,
  resolveGlobalAgentStopAccelerator,
};
