/**
 * Owns generic Electron agent-host copy/config supplied by the app skin.
 */

const DEFAULT_IPC_HOST_COPY = Object.freeze({
  identity: Object.freeze({
    sdkAgentName: 'Desktop Agent',
    mcpClientInfo: Object.freeze({
      name: 'Desktop Runtime',
      version: '0.0.0',
    }),
  }),
  queryEvents: Object.freeze({}),
});

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createIpcHostCopyRuntime(initialCopy = {}) {
  let hostCopy = DEFAULT_IPC_HOST_COPY;

  function configure(copy = {}) {
    const identity = isPlainObject(copy.identity)
      ? copy.identity
      : DEFAULT_IPC_HOST_COPY.identity;
    const queryEvents = isPlainObject(copy.queryEvents)
      ? copy.queryEvents
      : DEFAULT_IPC_HOST_COPY.queryEvents;
    hostCopy = identity === DEFAULT_IPC_HOST_COPY.identity
      && queryEvents === DEFAULT_IPC_HOST_COPY.queryEvents
      ? DEFAULT_IPC_HOST_COPY
      : {
        identity,
        queryEvents,
      };
  }

  function getCopy() {
    return hostCopy;
  }

  function getIdentity() {
    return hostCopy.identity;
  }

  function getSdkAgentName() {
    return hostCopy.identity.sdkAgentName;
  }

  function getMcpClientInfo() {
    return hostCopy.identity.mcpClientInfo;
  }

  function getQueryEvents() {
    return hostCopy.queryEvents;
  }

  configure(initialCopy);

  return {
    configure,
    getCopy,
    getIdentity,
    getSdkAgentName,
    getMcpClientInfo,
    getQueryEvents,
  };
}

module.exports = {
  createIpcHostCopyRuntime,
};
