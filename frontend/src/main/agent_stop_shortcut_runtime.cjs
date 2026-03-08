const ACTIVE_AGENT_LOOP_STOP_PHASES = new Set([
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
]);

function isAgentLoopStopShortcutPhase(phase) {
  return ACTIVE_AGENT_LOOP_STOP_PHASES.has(phase);
}

function initializeAgentStopShortcutRuntime(deps = {}) {
  const {
    globalShortcut,
    accelerator = 'Escape',
    onStop = () => {},
    warn = console.warn,
  } = deps;

  let enabled = false;
  let registered = false;

  function unregister() {
    if (!registered || !globalShortcut || typeof globalShortcut.unregister !== 'function') {
      registered = false;
      return;
    }
    globalShortcut.unregister(accelerator);
    registered = false;
  }

  function ensureRegistered() {
    if (registered) {
      return true;
    }
    if (!globalShortcut || typeof globalShortcut.register !== 'function') {
      return false;
    }

    const didRegister = globalShortcut.register(accelerator, () => {
      if (!enabled) {
        return;
      }
      onStop();
    });
    if (!didRegister) {
      warn(`[Main] Failed to register global stop shortcut: ${accelerator}`);
      registered = false;
      return false;
    }

    registered = true;
    return true;
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
    isEnabled: () => enabled,
    isRegistered: () => registered,
    setEnabled,
  };
}

module.exports = {
  ACTIVE_AGENT_LOOP_STOP_PHASES,
  initializeAgentStopShortcutRuntime,
  isAgentLoopStopShortcutPhase,
};
