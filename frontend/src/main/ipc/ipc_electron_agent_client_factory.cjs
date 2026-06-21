/**
 * Builds the Electron main AgentClient host configuration.
 */

const {
  appUserDataRoot,
} = require('../diagnostics/app_diagnostics_store.cjs');
const {
  createDesktopLocalRuntimeLaunchPlan,
} = require('../sidecar/local_runtime_launch_options.cjs');

function buildManagedBackendEndpoints(backendEndpointState) {
  return backendEndpointState.getCandidates().map(endpoint => ({
    backendUrl: endpoint.httpUrl || endpoint.httpBaseUrl || endpoint.backendUrl,
    httpBaseUrl: endpoint.httpUrl || endpoint.httpBaseUrl || endpoint.backendUrl,
    wsUrl: endpoint.wsUrl,
    wsOrigin: endpoint.wsOrigin || endpoint.httpUrl || endpoint.httpBaseUrl || endpoint.backendUrl,
  }));
}

function buildDesktopLocalRuntimeLaunchOptionsForAgent({
  desktopLocalRuntimeLaunchConfig = null,
  backendHttpUrl = null,
  WebSocketImpl = null,
  createLaunchPlan = createDesktopLocalRuntimeLaunchPlan,
  resolveUserDataRoot = appUserDataRoot,
} = {}) {
  const plan = createLaunchPlan({
    ...(desktopLocalRuntimeLaunchConfig || {}),
    backendEndpoints: {
      httpUrl: backendHttpUrl,
    },
    userDataRoot: resolveUserDataRoot(),
    ...(WebSocketImpl ? { WebSocketImpl } : {}),
  });
  if (plan.ok !== true) {
    throw new Error(plan.error || 'Desktop local runtime launch is unavailable.');
  }
  return plan.options;
}

function buildDesktopLocalRuntimeOptions({
  isTest = false,
  desktopLocalRuntimeLaunchConfig = null,
  backendHttpUrl = null,
  WebSocketImpl = null,
  createLaunchPlan = createDesktopLocalRuntimeLaunchPlan,
  resolveUserDataRoot = appUserDataRoot,
} = {}) {
  return isTest
    ? { autoStartLocalRuntime: false }
    : {
      autoLocalRuntime: buildDesktopLocalRuntimeLaunchOptionsForAgent({
        desktopLocalRuntimeLaunchConfig,
        backendHttpUrl,
        WebSocketImpl,
        createLaunchPlan,
        resolveUserDataRoot,
      }),
    };
}

function createElectronAgentClient({
  AgentClient,
  backendEndpointState,
  desktopLocalRuntimeLaunchConfig = null,
  WebSocketImpl = null,
  reconnectIntervalMs,
  connectTimeoutMs,
  idleDisconnectTimeoutMs,
  onBackendOpen = () => {},
  onBackendClose = () => {},
  onBackendError = () => {},
  onBackendHandshakeError = () => {},
  onBackendMessageError = () => {},
  onBackendSend = () => {},
  onBackendFallback = () => {},
  isTest = false,
  createLaunchPlan = createDesktopLocalRuntimeLaunchPlan,
  resolveUserDataRoot = appUserDataRoot,
  logMainRuntime = () => {},
} = {}) {
  logMainRuntime(`[Main][SDK] creating_client backend=${backendEndpointState.getHttpUrl()}`);
  return new AgentClient({
    backendUrl: backendEndpointState.getHttpUrl(),
    httpBaseUrl: backendEndpointState.getHttpUrl(),
    wsUrl: backendEndpointState.getWsUrl(),
    wsOrigin: backendEndpointState.getHttpUrl(),
    backendEndpoints: buildManagedBackendEndpoints(backendEndpointState),
    backendSession: 'managed',
    reconnectIntervalMs,
    connectTimeoutMs,
    idleDisconnectTimeoutMs,
    ...(WebSocketImpl ? { WebSocketImpl } : {}),
    ...buildDesktopLocalRuntimeOptions({
      isTest,
      desktopLocalRuntimeLaunchConfig,
      backendHttpUrl: backendEndpointState.getHttpUrl(),
      WebSocketImpl,
      createLaunchPlan,
      resolveUserDataRoot,
    }),
    onBackendOpen,
    onBackendClose,
    onBackendError,
    onBackendHandshakeError,
    onBackendMessageError,
    onBackendSend,
    onBackendFallback,
  });
}

function createElectronAgentClientFactoryRuntime({
  AgentClient,
  backendEndpointState,
  getDesktopLocalRuntimeLaunchConfig = () => null,
  getWebSocketImpl = () => null,
  reconnectIntervalMs,
  connectTimeoutMs,
  idleDisconnectTimeoutMs,
  onBackendOpen = () => {},
  onBackendClose = () => {},
  onBackendError = () => {},
  onBackendHandshakeError = () => {},
  onBackendMessageError = () => {},
  onBackendSend = () => {},
  onBackendFallback = () => {},
  isTest = false,
  createClient = createElectronAgentClient,
  logMainRuntime = () => {},
} = {}) {
  function createClientInstance() {
    return createClient({
      AgentClient,
      backendEndpointState,
      desktopLocalRuntimeLaunchConfig: getDesktopLocalRuntimeLaunchConfig(),
      WebSocketImpl: getWebSocketImpl(),
      reconnectIntervalMs,
      connectTimeoutMs,
      idleDisconnectTimeoutMs,
      onBackendOpen,
      onBackendClose,
      onBackendError,
      onBackendHandshakeError,
      onBackendMessageError,
      onBackendSend,
      onBackendFallback,
      isTest: typeof isTest === 'function' ? isTest() : isTest,
      logMainRuntime,
    });
  }

  return {
    createClient: createClientInstance,
  };
}

module.exports = {
  buildDesktopLocalRuntimeLaunchOptionsForAgent,
  buildDesktopLocalRuntimeOptions,
  buildManagedBackendEndpoints,
  createElectronAgentClientFactoryRuntime,
};
