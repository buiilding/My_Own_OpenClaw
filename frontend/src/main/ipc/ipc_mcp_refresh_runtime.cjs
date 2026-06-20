/**
 * Owns Electron-main MCP refresh orchestration around the Agent SDK and local registry fallback.
 */

function resolveIsTest(isTest) {
  return typeof isTest === 'function' ? isTest() : isTest === true;
}

function createMcpRefreshRuntime({
  getDesktopUiConfigForMcpRegistry,
  countMcpEnabledServersInConfig,
  ensureAgent,
  refreshMcpServersForConfig,
  getMcpClientInfo = () => null,
  isTest = () => process.env.NODE_ENV === 'test',
  log = () => {},
} = {}) {
  let pendingStartupMcpRefreshPromise = null;

  async function refreshMcpServersForLatestConfig(reason = 'mcp-refresh') {
    const config = getDesktopUiConfigForMcpRegistry?.() || {};
    if (!resolveIsTest(isTest)) {
      const agent = await ensureAgent?.({ reason });
      if (typeof agent?.refreshMcpServers === 'function') {
        return agent.refreshMcpServers({ config });
      }
    }
    return refreshMcpServersForConfig?.({
      config,
      clientInfo: getMcpClientInfo(),
    });
  }

  function refreshEnabledMcpServersAfterStartup(config) {
    if (
      resolveIsTest(isTest)
      || countMcpEnabledServersInConfig?.(config) === 0
    ) {
      return;
    }
    if (pendingStartupMcpRefreshPromise) {
      return;
    }
    pendingStartupMcpRefreshPromise = refreshMcpServersForLatestConfig('mcp-startup')
      .catch((error) => {
        log(`Failed to refresh enabled MCP servers at startup: ${error?.message || error}`);
      })
      .finally(() => {
        pendingStartupMcpRefreshPromise = null;
      });
  }

  function getPendingStartupMcpRefreshPromise() {
    return pendingStartupMcpRefreshPromise;
  }

  function reset() {
    pendingStartupMcpRefreshPromise = null;
  }

  return {
    getPendingStartupMcpRefreshPromise,
    refreshEnabledMcpServersAfterStartup,
    refreshMcpServersForLatestConfig,
    reset,
  };
}

module.exports = {
  createMcpRefreshRuntime,
};
