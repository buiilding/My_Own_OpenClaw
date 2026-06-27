/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const desktopUiConfigStoreModule = require('../../src/main/ipc/ipc_desktop_ui_config_store.cjs');
const {
  createDesktopUiConfigStoreRuntime,
} = desktopUiConfigStoreModule;

function isValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

function redactDesktopUiConfigProviderSecrets(config) {
  if (!isValidConfigPayload(config)) {
    return config;
  }
  const redacted = { ...config };
  if (redacted.provider_api_keys) {
    redacted.provider_api_keys = Object.fromEntries(
      Object.entries(redacted.provider_api_keys).map(([provider, entry]) => [
        provider,
        isValidConfigPayload(entry) ? { ...entry, api_key: '' } : entry,
      ]),
    );
  }
  delete redacted.provider_oauth;
  return redacted;
}

function createHarness(overrides = {}) {
  const saveDesktopUiConfigToDisk = jest.fn(async () => ({ success: true }));
  const deps = {
    loadDesktopUiConfigFromDisk: jest.fn(async () => overrides.disk || null),
    loadDesktopUiConfigFromDiskSync: jest.fn(() => overrides.disk || null),
    redactDesktopUiConfigProviderSecrets: jest.fn(redactDesktopUiConfigProviderSecrets),
    saveDesktopUiConfigToDisk,
    isValidConfigPayload,
    applyShortcutStatusFallbackToConfig: jest.fn((config) => ({
      ...config,
      global_agent_stop_shortcut: config.global_agent_stop_shortcut || 'CommandOrControl+Shift+Escape',
    })),
    appendDiagnosticEvent: jest.fn((event) => ({ stored: true, event })),
    mcpEnablementDiagnosticsPath: '/diagnostics/mcp.jsonl',
    log: jest.fn(),
    now: () => 123,
    random: () => 0.5,
    ...overrides.deps,
  };
  const runtime = createDesktopUiConfigStoreRuntime(deps);
  if (overrides.initial) {
    runtime.replaceFromDisk(overrides.initial);
  }
  return {
    deps,
    runtime,
    saveDesktopUiConfigToDisk,
  };
}

describe('ipc_desktop_ui_config_store', () => {
  test('hydrates disk config into a redacted cloned store snapshot', async () => {
    const { deps, runtime } = createHarness({
      disk: {
        model_mode: 'offline',
        provider_oauth: { openai: { access_token: 'secret' } },
        provider_api_keys: { openai: { enabled: true, api_key: 'sk-test' } },
      },
    });

    await expect(runtime.hydrate()).resolves.toEqual({
      model_mode: 'offline',
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
      provider_api_keys: { openai: { enabled: true, api_key: '' } },
    });

    const snapshot = runtime.getSnapshot();
    snapshot.model_mode = 'online';
    snapshot.provider_api_keys.openai.api_key = 'mutated';

    expect(runtime.getSnapshot()).toEqual({
      model_mode: 'offline',
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
      provider_api_keys: { openai: { enabled: true, api_key: '' } },
    });
    expect(deps.loadDesktopUiConfigFromDisk).toHaveBeenCalledWith(deps.log);
  });

  test('persists raw renderer provider credentials while live store remains redacted', async () => {
    const { runtime, saveDesktopUiConfigToDisk } = createHarness();

    await expect(runtime.persist({
      model_provider: 'openai',
      provider_api_keys: { openai: { enabled: true, api_key: 'sk-live' } },
    })).resolves.toEqual({ success: true });

    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      model_provider: 'openai',
      provider_api_keys: { openai: { enabled: true, api_key: 'sk-live' } },
    }, expect.any(Function));
    expect(runtime.getSnapshot()).toEqual({
      model_provider: 'openai',
      provider_api_keys: { openai: { enabled: true, api_key: '' } },
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });
  });

  test('preserves store-owned MCP enablement while saving renderer config', async () => {
    const { deps, runtime, saveDesktopUiConfigToDisk } = createHarness({
      initial: {
        model_mode: 'online',
        agent_enabled_mcp_servers: ['mcp:memory', 123, 'mcp:fs'],
      },
    });

    await expect(runtime.persist({
      model_provider: 'openai',
    })).resolves.toEqual({ success: true });

    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      model_provider: 'openai',
      agent_enabled_mcp_servers: ['mcp:memory', 'mcp:fs'],
    }, deps.log);
    expect(deps.loadDesktopUiConfigFromDiskSync).not.toHaveBeenCalled();
    expect(deps.appendDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      path: '/diagnostics/mcp.jsonl',
      runtime: 'electron-main',
      traceId: 'mcp-enable-123-8',
      stage: 'config_saved',
      status: 'succeeded',
      data: expect.objectContaining({
        preserveMcpEnablement: true,
        preserveSource: 'store',
        payloadHasEnabledKey: false,
        latestHasEnabledKey: true,
        persistedEnabledServerCount: 2,
        payloadEnabledServerCount: 0,
      }),
    }));
  });

  test('falls back to disk MCP enablement when store has no allowlist', async () => {
    const { deps, runtime, saveDesktopUiConfigToDisk } = createHarness({
      initial: { model_mode: 'offline' },
      disk: {
        agent_enabled_mcp_servers: ['mcp:git', false, 'mcp:memory'],
      },
    });

    await expect(runtime.persist({
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

  test('preserves absent agent query settings from the live store while saving partial renderer config', async () => {
    const { runtime, saveDesktopUiConfigToDisk } = createHarness({
      initial: {
        agent_custom_instructions: 'Use the saved agent prompt.',
        agent_disabled_local_tools: ['mouse_control', 'keyboard_control'],
        agent_disabled_remote_tools: ['web_search'],
      },
    });

    await expect(runtime.persist({
      model_provider: 'scripted',
    })).resolves.toEqual({ success: true });

    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      model_provider: 'scripted',
      agent_custom_instructions: 'Use the saved agent prompt.',
      agent_disabled_local_tools: ['mouse_control', 'keyboard_control'],
      agent_disabled_remote_tools: ['web_search'],
    }, expect.any(Function));
    expect(runtime.getSnapshot()).toEqual(expect.objectContaining({
      model_provider: 'scripted',
      agent_custom_instructions: 'Use the saved agent prompt.',
      agent_disabled_local_tools: ['mouse_control', 'keyboard_control'],
      agent_disabled_remote_tools: ['web_search'],
    }));
  });

  test('preserves absent agent query settings from disk when renderer config arrives before hydration', async () => {
    const { deps, runtime, saveDesktopUiConfigToDisk } = createHarness({
      disk: {
        agent_custom_instructions: 'Persisted prompt.',
        agent_disabled_local_tools: ['screenshot'],
        agent_disabled_remote_tools: ['web_search'],
      },
    });

    await expect(runtime.persist({
      selected_model_id: 'scripted-runtime',
    })).resolves.toEqual({ success: true });

    expect(deps.loadDesktopUiConfigFromDiskSync).toHaveBeenCalled();
    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      selected_model_id: 'scripted-runtime',
      agent_custom_instructions: 'Persisted prompt.',
      agent_disabled_local_tools: ['screenshot'],
      agent_disabled_remote_tools: ['web_search'],
    }, expect.any(Function));
  });

  test('repairs stale empty live agent query settings from disk for query assembly', () => {
    const { runtime } = createHarness({
      disk: {
        model_provider: 'scripted',
        selected_model_id: 'scripted-runtime',
        agent_custom_instructions: 'Persisted prompt.',
        agent_disabled_local_tools: ['mouse_control'],
        agent_disabled_remote_tools: ['web_search'],
      },
    });
    runtime.replaceFromRenderer({
      model_provider: 'scripted',
      selected_model_id: 'scripted-runtime',
      agent_custom_instructions: '',
      agent_disabled_local_tools: [],
      agent_disabled_remote_tools: [],
    });

    expect(runtime.getDesktopUiConfigForAgentDefinition()).toEqual(expect.objectContaining({
      model_provider: 'scripted',
      selected_model_id: 'scripted-runtime',
      agent_custom_instructions: 'Persisted prompt.',
      agent_disabled_local_tools: ['mouse_control'],
      agent_disabled_remote_tools: ['web_search'],
    }));
  });

  test('does not repair explicit empty agent query settings while save races old disk config', async () => {
    const { runtime } = createHarness({
      disk: {
        agent_custom_instructions: 'Persisted prompt.',
        agent_disabled_local_tools: ['mouse_control'],
        agent_disabled_remote_tools: ['web_search'],
      },
    });

    await expect(runtime.persist({
      agent_custom_instructions: '',
      agent_disabled_local_tools: [],
      agent_disabled_remote_tools: [],
    })).resolves.toEqual({ success: true });

    expect(runtime.getDesktopUiConfigForAgentDefinition()).toEqual(expect.objectContaining({
      agent_custom_instructions: '',
      agent_disabled_local_tools: [],
      agent_disabled_remote_tools: [],
    }));
  });

  test('allows renderer config to explicitly clear agent query settings', async () => {
    const { runtime, saveDesktopUiConfigToDisk } = createHarness({
      initial: {
        agent_custom_instructions: 'Use the saved agent prompt.',
        agent_disabled_local_tools: ['mouse_control'],
        agent_disabled_remote_tools: ['web_search'],
      },
    });

    await expect(runtime.persist({
      agent_custom_instructions: '',
      agent_disabled_local_tools: [],
      agent_disabled_remote_tools: [],
    })).resolves.toEqual({ success: true });

    expect(saveDesktopUiConfigToDisk).toHaveBeenCalledWith({
      agent_custom_instructions: '',
      agent_disabled_local_tools: [],
      agent_disabled_remote_tools: [],
    }, expect.any(Function));
    expect(runtime.getSnapshot()).toEqual(expect.objectContaining({
      agent_custom_instructions: '',
      agent_disabled_local_tools: [],
      agent_disabled_remote_tools: [],
    }));
  });

  test('does not preserve MCP enablement for explicit MCP toggle persistence', async () => {
    const { deps, runtime, saveDesktopUiConfigToDisk } = createHarness({
      initial: {
        agent_enabled_mcp_servers: ['mcp:old'],
      },
    });

    await expect(runtime.persist(
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

  test('advances the live store before disk save resolves for query agent settings', async () => {
    let resolveSave;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });
    const { runtime } = createHarness({
      deps: {
        saveDesktopUiConfigToDisk: jest.fn(() => savePromise),
      },
    });

    const persistPromise = runtime.persist({
      agent_custom_instructions: 'Use the saved agent prompt.',
      agent_disabled_remote_tools: ['web_search'],
    });

    expect(runtime.getSnapshot()).toEqual({
      agent_custom_instructions: 'Use the saved agent prompt.',
      agent_disabled_remote_tools: ['web_search'],
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });

    resolveSave({ success: true });
    await expect(persistPromise).resolves.toEqual({ success: true });
  });

  test('reports failed saves after advancing the live store', async () => {
    const { deps, runtime } = createHarness({
      initial: { agent_enabled_mcp_servers: ['mcp:old'] },
      deps: {
        saveDesktopUiConfigToDisk: jest.fn(async () => ({
          success: false,
          error: 'disk full',
        })),
      },
    });

    await expect(runtime.persist({
      model_mode: 'online',
    })).resolves.toEqual({
      success: false,
      error: 'disk full',
    });

    expect(runtime.getSnapshot()).toEqual({
      model_mode: 'online',
      agent_enabled_mcp_servers: ['mcp:old'],
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });
    expect(deps.appendDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'config_save_failed',
      status: 'failed',
      error: 'disk full',
    }));
  });

  test('patches main-owned fields without mutating prior snapshots', () => {
    const { runtime } = createHarness({
      initial: { model_mode: 'online' },
    });
    const beforePatch = runtime.getSnapshot();

    expect(runtime.patchMainOwnedFields({
      agent_enabled_mcp_servers: ['mcp:memory'],
    })).toEqual({
      model_mode: 'online',
      agent_enabled_mcp_servers: ['mcp:memory'],
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });
    expect(beforePatch).toEqual({
      model_mode: 'online',
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });
  });

  test('ipc.cjs composes desktop UI config authority through the store module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_desktop_ui_config_store.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createDesktopUiConfigStoreRuntime({');
    expect(mainSource).toContain('desktopUiConfigStore.getSnapshot()');
    expect(mainSource).toContain('desktopUiConfigStore.persist(config, options)');
    expect(mainSource).not.toContain('createDesktopUiConfigCache');
    expect(mainSource).not.toContain('createDesktopUiConfigPersistenceRuntime');
    expect(helperSource).toContain('function createDesktopUiConfigStoreRuntime');
    expect(helperSource).toContain('function preserveMainOwnedFields');
    expect(helperSource).toContain('function recordMcpEnablementDiagnostic');
    expect(desktopUiConfigStoreModule.createMcpEnablementTraceId).toBeUndefined();
  });
});
