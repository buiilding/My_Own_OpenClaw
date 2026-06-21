/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const desktopUiConfigPersistenceModule = require('../../frontend/src/main/ipc/ipc_desktop_ui_config_persistence_runtime.cjs');
const {
  createDesktopUiConfigPersistenceRuntime,
} = desktopUiConfigPersistenceModule;

function isValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

function createHarness(overrides = {}) {
  let latest = overrides.latest || null;
  const saveDesktopUiConfigToDisk = jest.fn(async () => ({ success: true }));
  const deps = {
    getLatestDesktopUiConfig: jest.fn(() => latest),
    setLatestDesktopUiConfig: jest.fn((config) => {
      latest = config;
    }),
    loadDesktopUiConfigFromDiskSync: jest.fn(() => overrides.disk || null),
    redactDesktopUiConfigProviderSecrets: jest.fn((config) => {
      if (!isValidConfigPayload(config)) {
        return config;
      }
      const redacted = { ...config };
      if (redacted.provider_api_keys) {
        redacted.provider_api_keys = { redacted: true };
      }
      return redacted;
    }),
    saveDesktopUiConfigToDisk,
    isValidConfigPayload,
    appendDiagnosticEvent: jest.fn((event) => ({ stored: true, event })),
    mcpEnablementDiagnosticsPath: '/diagnostics/mcp.jsonl',
    log: jest.fn(),
    now: () => 123,
    random: () => 0.5,
    ...overrides.deps,
  };
  const runtime = createDesktopUiConfigPersistenceRuntime(deps);
  return {
    deps,
    getLatest: () => latest,
    runtime,
    saveDesktopUiConfigToDisk,
  };
}

describe('ipc_desktop_ui_config_persistence_runtime', () => {
  test('preserves latest main-owned MCP enablement while redacting and saving renderer config', async () => {
    const { deps, getLatest, runtime, saveDesktopUiConfigToDisk } = createHarness({
      latest: {
        model_mode: 'online',
        agent_enabled_mcp_servers: ['mcp:memory', 123, 'mcp:fs'],
      },
    });
    const config = {
      model_provider: 'openai',
      provider_api_keys: { openai: { api_key: 'secret' } },
    };

    await expect(runtime.persistDesktopUiConfigToDisk(config)).resolves.toEqual({
      success: true,
    });

    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      model_provider: 'openai',
      provider_api_keys: { redacted: true },
      agent_enabled_mcp_servers: ['mcp:memory', 'mcp:fs'],
    }, deps.log);
    expect(getLatest()).toEqual({
      model_provider: 'openai',
      provider_api_keys: { redacted: true },
      agent_enabled_mcp_servers: ['mcp:memory', 'mcp:fs'],
    });
    expect(deps.loadDesktopUiConfigFromDiskSync).not.toHaveBeenCalled();
    expect(deps.appendDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      path: '/diagnostics/mcp.jsonl',
      runtime: 'electron-main',
      traceId: 'mcp-enable-123-8',
      stage: 'config_saved',
      status: 'succeeded',
      data: expect.objectContaining({
        preserveMcpEnablement: true,
        preserveSource: 'latest',
        payloadHasEnabledKey: false,
        latestHasEnabledKey: true,
        persistedEnabledServerCount: 2,
        payloadEnabledServerCount: 0,
      }),
    }));
  });

  test('falls back to disk MCP enablement when latest config has no allowlist', async () => {
    const { deps, runtime, saveDesktopUiConfigToDisk } = createHarness({
      latest: { model_mode: 'offline' },
      disk: {
        agent_enabled_mcp_servers: ['mcp:git', false, 'mcp:memory'],
      },
    });

    await expect(runtime.persistDesktopUiConfigToDisk({
      selected_model_id: 'local-model',
    })).resolves.toEqual({ success: true });

    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      selected_model_id: 'local-model',
      agent_enabled_mcp_servers: ['mcp:git', 'mcp:memory'],
    }, deps.log);
    expect(deps.appendDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        preserveSource: 'disk',
        persistedEnabledServerCount: 2,
      }),
    }));
  });

  test('does not preserve MCP enablement for explicit MCP toggle persistence', async () => {
    const { deps, runtime, saveDesktopUiConfigToDisk } = createHarness({
      latest: {
        agent_enabled_mcp_servers: ['mcp:old'],
      },
    });

    await expect(runtime.persistDesktopUiConfigToDisk(
      { agent_enabled_mcp_servers: ['mcp:new'] },
      { preserveMcpEnablement: false },
    )).resolves.toEqual({ success: true });

    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      agent_enabled_mcp_servers: ['mcp:new'],
    }, deps.log);
    expect(deps.appendDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        preserveMcpEnablement: false,
        preserveSource: 'none',
        payloadHasEnabledKey: true,
        persistedEnabledServerCount: 1,
        payloadEnabledServerCount: 1,
      }),
    }));
  });

  test('reports failed saves without advancing latest config', async () => {
    const { deps, getLatest, runtime } = createHarness({
      latest: { agent_enabled_mcp_servers: ['mcp:old'] },
      deps: {
        saveDesktopUiConfigToDisk: jest.fn(async () => ({
          success: false,
          error: 'disk full',
        })),
      },
    });

    await expect(runtime.persistDesktopUiConfigToDisk({
      model_mode: 'online',
    })).resolves.toEqual({
      success: false,
      error: 'disk full',
    });

    expect(getLatest()).toEqual({ agent_enabled_mcp_servers: ['mcp:old'] });
    expect(deps.appendDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'config_save_failed',
      status: 'failed',
      error: 'disk full',
    }));
  });

  test('builds deterministic MCP enablement diagnostic trace ids through the runtime facade', () => {
    const { deps, runtime } = createHarness({
      deps: {
        now: () => 456,
        random: () => 0.25,
      },
    });

    expect(runtime.recordMcpEnablementDiagnostic({
      stage: 'config_probe',
      status: 'succeeded',
    })).toEqual({
      stored: true,
      event: expect.objectContaining({
        runtime: 'electron-main',
        traceId: 'mcp-enable-456-4',
        stage: 'config_probe',
        status: 'succeeded',
      }),
    });
    expect(deps.appendDiagnosticEvent).toHaveBeenCalledTimes(1);
  });

  test('ipc.cjs delegates desktop UI config persistence semantics to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_desktop_ui_config_persistence_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createDesktopUiConfigPersistenceRuntime({');
    expect(mainSource).not.toContain('function preserveMainOwnedDesktopUiConfigFields');
    expect(mainSource).not.toContain('function resolveMcpEnablementPreserveSource');
    expect(mainSource).not.toContain('function recordMcpEnablementDiagnostic');
    expect(mainSource).not.toContain('function countMcpEnabledServersInConfig');
    expect(helperSource).toContain('function preserveMainOwnedDesktopUiConfigFields');
    expect(helperSource).toContain('function resolveMcpEnablementPreserveSource');
    expect(helperSource).toContain('function recordMcpEnablementDiagnostic');
    expect(helperSource).toContain('function countMcpEnabledServersInConfig');
    expect(desktopUiConfigPersistenceModule.createMcpEnablementTraceId).toBeUndefined();
  });
});
