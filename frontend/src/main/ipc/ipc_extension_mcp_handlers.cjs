/**
 * Handles extension and MCP registry IPC events for the Electron main process.
 */

function registerExtensionMcpHandlers({
  ipcMain,
  loadPublicExtensionRegistry,
  listMcpServersForConfig,
  updateMcpServerEnablementForConfig,
  getEnabledMcpServerSpecsForConfig,
  refreshMcpServersForLatestConfig,
  persistDesktopUiConfigToDisk,
  getDesktopUiConfigForMcpRegistry,
  ensureAgent,
  mcpClientInfo,
  isTest = process.env.NODE_ENV === 'test',
}) {
  ipcMain.handle('list-agent-extensions', async () => {
    const registry = loadPublicExtensionRegistry();
    const mcpRegistry = listMcpServersForConfig({ config: getDesktopUiConfigForMcpRegistry() });
    return {
      ...registry,
      mcps: mcpRegistry.mcps,
    };
  });

  ipcMain.handle('list-mcp-servers', async () => (
    listMcpServersForConfig({ config: getDesktopUiConfigForMcpRegistry() })
  ));

  ipcMain.handle('set-mcp-server-enabled', async (_event, payload = {}) => {
    const serverId = typeof payload?.id === 'string' ? payload.id.trim() : '';
    if (!serverId) {
      return {
        success: false,
        error: 'Missing MCP server id.',
      };
    }

    const result = await updateMcpServerEnablementForConfig({
      config: getDesktopUiConfigForMcpRegistry(),
      serverId,
      enabled: payload.enabled === true,
      persistConfig: (nextConfig) => persistDesktopUiConfigToDisk(nextConfig, {
        preserveMcpEnablement: false,
      }),
      resolveLocalRuntime: isTest
        ? null
        : async () => (await ensureAgent({ reason: 'mcp-toggle' }))?.localRuntime || null,
      clientInfo: mcpClientInfo,
    });

    if (result?.success === true && !isTest) {
      const agent = await ensureAgent({ reason: 'mcp-manifest-refresh' });
      const enabledSpecs = getEnabledMcpServerSpecsForConfig({
        config: getDesktopUiConfigForMcpRegistry(),
      });
      await agent.registerMcps?.(enabledSpecs, { replace: true });
      result.registry = await refreshMcpServersForLatestConfig('mcp-toggle-post-sdk-refresh');
    }
    return result;
  });

  ipcMain.handle('refresh-mcp-servers', async () => (
    refreshMcpServersForLatestConfig('mcp-refresh')
  ));
}

function createExtensionMcpHandlersRuntime({
  loadPublicExtensionRegistry,
  listMcpServersForConfig,
  updateMcpServerEnablementForConfig,
  getEnabledMcpServerSpecsForConfig,
  refreshMcpServersForLatestConfig,
  persistDesktopUiConfigToDisk,
  getDesktopUiConfigForMcpRegistry,
  ensureAgent,
  mcpClientInfo,
  isTest = process.env.NODE_ENV === 'test',
} = {}) {
  function register({ ipcMain } = {}) {
    const resolvedMcpClientInfo = typeof mcpClientInfo === 'function'
      ? mcpClientInfo()
      : mcpClientInfo;
    return registerExtensionMcpHandlers({
      ipcMain,
      loadPublicExtensionRegistry,
      listMcpServersForConfig,
      updateMcpServerEnablementForConfig,
      getEnabledMcpServerSpecsForConfig,
      refreshMcpServersForLatestConfig,
      persistDesktopUiConfigToDisk,
      getDesktopUiConfigForMcpRegistry,
      ensureAgent,
      mcpClientInfo: resolvedMcpClientInfo,
      isTest,
    });
  }

  return {
    register,
  };
}

module.exports = {
  createExtensionMcpHandlersRuntime,
  registerExtensionMcpHandlers,
};
