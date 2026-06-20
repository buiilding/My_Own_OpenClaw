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
  installAuthIdentityRuntime,
  activeQueryContextState,
  desktopUiConfigCache,
  globalStopShortcutConfigRuntime,
  installAuthRuntime,
  mcpRefreshRuntime,
  hostOptionState,
  rendererWindowRegistry,
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
    call(installAuthIdentityRuntime, 'reset');
    call(backendSessionState, 'reset');
    call(activeQueryContextState, 'reset');
    call(desktopUiConfigCache, 'reset');
    call(globalStopShortcutConfigRuntime, 'reset');
    call(installAuthRuntime, 'reset');
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
    call(rendererWindowRegistry, 'reset');
    call(backendMessageObserverRegistry, 'reset');
    call(installAuthRuntime, 'reset');
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
