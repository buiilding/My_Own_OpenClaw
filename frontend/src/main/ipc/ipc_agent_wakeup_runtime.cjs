/**
 * Orchestrates Electron main AgentClient wake-up and adapter construction.
 */

async function startAgentRuntime({
  reason = 'request',
  workspacePath = null,
} = {}, deps = {}) {
  const {
    ensureInstallAuthState = async () => {},
    resolveWorkspacePathForAgent = () => null,
    getAgentClient,
    buildDesktopInstallAuth = () => undefined,
    getSdkAgentName = () => 'Desktop Agent',
    isTest = () => false,
    getEnabledMcpServerSpecsForConfig = () => [],
    getDesktopUiConfigForMcpRegistry = () => null,
    getLocalToolLifecycle = () => null,
    createDirectWakeUpAgentAdapter,
    buildDirectWakeUpAgentAdapterDeps = () => ({}),
    appendIpcBridgeDiagnostic = () => {},
    log = () => {},
  } = deps;

  await ensureInstallAuthState();
  const resolvedWorkspacePath = workspacePath || resolveWorkspacePathForAgent() || undefined;
  const client = getAgentClient();
  const testMode = Boolean(isTest());
  const agent = await client.wakeUp({
    installAuth: buildDesktopInstallAuth(),
    name: getSdkAgentName(),
    workspacePath: resolvedWorkspacePath,
    builtins: testMode ? [] : 'default',
    mcps: testMode
      ? []
      : getEnabledMcpServerSpecsForConfig({ config: getDesktopUiConfigForMcpRegistry() }),
    ...(testMode ? { memory: false, persistence: false } : {}),
    localToolLifecycle: getLocalToolLifecycle(),
  });
  const adapter = createDirectWakeUpAgentAdapter({
    agent,
    workspacePath: resolvedWorkspacePath || null,
    deps: buildDirectWakeUpAgentAdapterDeps(),
  });
  appendIpcBridgeDiagnostic({
    action: 'runtime.wakeup',
    phase: 'sdk',
    status: 'succeeded',
    statusReason: reason,
    hasWorkspacePath: Boolean(resolvedWorkspacePath),
  });
  log(`Agent SDK wakeUp runtime started for ${reason}.`);
  return adapter;
}

function createAgentWakeupRuntime(deps = {}) {
  async function start(input = {}) {
    return startAgentRuntime(input, deps);
  }

  return {
    start,
  };
}

module.exports = {
  createAgentWakeupRuntime,
  startAgentRuntime,
};
