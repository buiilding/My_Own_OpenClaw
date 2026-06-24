/**
 * Owns IPC process reset orchestration for tests and reconnect cleanup.
 */

function call(target, method, ...args) {
  if (target && typeof target[method] === 'function') {
    return target[method](...args);
  }
  return undefined;
}

function createIpcProcessResetRuntime({
  settingsSyncRuntime,
  backendSessionState,
  liveTurnState,
  currentTurnTraceLogger,
  electronMainTraceLogger,
  backendConnectionGateState,
  installAuthContextRuntime,
  activeQueryContextState,
  desktopUiConfigStore,
  globalStopShortcutConfigRuntime,
  mcpRefreshRuntime,
  hostOptionState,
  rendererWindowRuntime,
  backendMessageObserverRegistry,
  agentClientLifecycle,
  agentRuntimeLifecycle,
} = {}) {
  function resetSettingsSyncState() {
    call(settingsSyncRuntime, 'reset');
  }

  function resetBackendSessionState() {
    call(backendSessionState, 'reset');
    call(liveTurnState, 'reset');
    call(currentTurnTraceLogger, 'reset');
    call(electronMainTraceLogger, 'reset');
  }

  function resetIpcProcessStateForTests() {
    call(backendConnectionGateState, 'reset');
    call(installAuthContextRuntime, 'reset');
    call(backendSessionState, 'reset');
    call(activeQueryContextState, 'reset');
    call(desktopUiConfigStore, 'reset');
    call(globalStopShortcutConfigRuntime, 'reset');
    call(mcpRefreshRuntime, 'reset');
    call(liveTurnState, 'reset');
    call(hostOptionState, 'reset');
    call(currentTurnTraceLogger, 'reset');
    call(electronMainTraceLogger, 'reset');
  }

  function shutdownIpcForTests() {
    resetSettingsSyncState();
    resetBackendSessionState();
    resetIpcProcessStateForTests();
    call(rendererWindowRuntime, 'reset');
    call(backendMessageObserverRegistry, 'reset');
    call(installAuthContextRuntime, 'reset');
    call(backendConnectionGateState, 'setConnected', false);
    call(mcpRefreshRuntime, 'reset');
    call(liveTurnState, 'resetPendingTurn');
    call(agentClientLifecycle, 'shutdownAndReset');
    call(agentRuntimeLifecycle, 'reset', { closeActiveAgent: true });
  }

  return {
    resetBackendSessionState,
    resetIpcProcessStateForTests,
    resetSettingsSyncState,
    shutdownIpcForTests,
  };
}

module.exports = {
  createIpcProcessResetRuntime,
};
