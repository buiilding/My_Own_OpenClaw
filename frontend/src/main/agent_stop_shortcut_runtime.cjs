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

function initializeAgentStopShortcutRuntime(deps = {}) {
  const {
    globalShortcut,
    accelerator = null,
    platform = process.platform,
    onStop = () => {},
    warn = console.warn,
  } = deps;

  let enabled = false;
  let registered = false;
  let currentAccelerator = resolveGlobalAgentStopAccelerator(platform, accelerator);

  function unregister() {
    if (!registered || !globalShortcut || typeof globalShortcut.unregister !== 'function') {
      registered = false;
      return;
    }
    globalShortcut.unregister(currentAccelerator);
    registered = false;
  }

  function ensureRegistered() {
    if (registered) {
      return true;
    }
    if (!globalShortcut || typeof globalShortcut.register !== 'function') {
      return false;
    }

    const didRegister = globalShortcut.register(currentAccelerator, () => {
      if (!enabled) {
        return;
      }
      onStop();
    });
    if (!didRegister) {
      warn(`[Main] Failed to register global stop shortcut: ${currentAccelerator}`);
      registered = false;
      return false;
    }

    registered = true;
    return true;
  }

  function setAccelerator(nextAccelerator) {
    const normalizedAccelerator = normalizeGlobalAgentStopAccelerator(nextAccelerator, platform);
    if (normalizedAccelerator === currentAccelerator) {
      return currentAccelerator;
    }

    const previousAccelerator = currentAccelerator;
    const wasEnabled = enabled;
    unregister();
    currentAccelerator = normalizedAccelerator;

    if (wasEnabled && !ensureRegistered()) {
      currentAccelerator = previousAccelerator;
      ensureRegistered();
    }

    return currentAccelerator;
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
    getAccelerator: () => currentAccelerator,
    isEnabled: () => enabled,
    isRegistered: () => registered,
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
