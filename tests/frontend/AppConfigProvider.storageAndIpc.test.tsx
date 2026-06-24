/**
 * Covers app config provider.storage and ipc. behavior in the frontend test suite.
 */

import {
  act,
  DesktopSettingsRuntimeClient,
  flushAsyncEffects,
  getIpcListener,
  INVOKE_CHANNELS,
  IpcBridge,
  mockBindTranscriptUser,
  mockDesktopSettingsUpdateSettings,
  mockGetRendererConfigStorageKey,
  mockIsRendererConfigStorageEvent,
  mockLoadConfigFromStorage,
  mockSaveConfigToStorage,
  mockSetRuntimeEndpointHttpUrl,
  mockSyncRuntimeEndpointFromSnapshot,
  mockUpdateTranscriptSession,
  ON_CHANNELS,
  registerAppConfigProviderSuiteLifecycle,
  renderAppConfigContext,
  setClientUserIdResponse,
  setLoadDesktopUiConfigResponse,
} from './AppConfigProvider.testUtils';

registerAppConfigProviderSuiteLifecycle();

describe('AppConfigProvider storage + IPC status handling', () => {
  test('skips disk-sync writes when disk config matches stored config', async () => {
    setLoadDesktopUiConfigResponse({ speech_mode_enabled: false });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockSaveConfigToStorage).not.toHaveBeenCalled();
    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalled();
  });

  test('applies disk config when it differs from stored config without syncing before connection', async () => {
    setLoadDesktopUiConfigResponse({
      speech_mode_enabled: true,
      selected_model_id: 'model-x',
      model_provider: 'openai',
    });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        speech_mode_enabled: true,
        selected_model_id: 'model-x',
        model_provider: 'openai',
      }),
    );
    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalled();
  });

  test('persists merged local Agent settings to main config after disk load', async () => {
    mockLoadConfigFromStorage.mockReturnValue({
      speech_mode_enabled: false,
      agent_custom_instructions: 'Use the local Agent prompt.',
      agent_disabled_local_tools: ['mouse_control', 'keyboard_control'],
      agent_disabled_remote_tools: ['web_search'],
    });
    setLoadDesktopUiConfigResponse({
      speech_mode_enabled: false,
      provider_api_keys: {
        anthropic: { enabled: true, api_key: '' },
      },
    });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.objectContaining({
        provider_api_keys: {
          anthropic: { enabled: true, api_key: '' },
        },
        agent_custom_instructions: 'Use the local Agent prompt.',
        agent_disabled_local_tools: ['mouse_control', 'keyboard_control'],
        agent_disabled_remote_tools: ['web_search'],
      }),
    );
    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        agent_custom_instructions: expect.any(String),
      }),
    );
  });

  test('persists local Agent settings to main config when no disk config exists', async () => {
    mockLoadConfigFromStorage.mockReturnValue({
      speech_mode_enabled: false,
      agent_custom_instructions: 'Use the renderer-only Agent prompt.',
      agent_disabled_local_tools: ['mouse_control'],
      agent_disabled_remote_tools: ['web_search'],
    });
    setLoadDesktopUiConfigResponse(null);

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.objectContaining({
        agent_custom_instructions: 'Use the renderer-only Agent prompt.',
        agent_disabled_local_tools: ['mouse_control'],
        agent_disabled_remote_tools: ['web_search'],
      }),
    );
  });

  test('syncs loaded disk config when runtime is already connected', async () => {
    setClientUserIdResponse({ isConnected: true });
    setLoadDesktopUiConfigResponse({
      speech_mode_enabled: true,
      selected_model_id: 'model-x',
      model_provider: 'openai',
    });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(DesktopSettingsRuntimeClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        speech_mode_enabled: true,
      }),
    );
    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        selected_model_id: 'model-x',
      }),
    );
  });

  test('applies cross-window config changes from localStorage events', () => {
    const { result } = renderAppConfigContext();

    mockLoadConfigFromStorage.mockReturnValue({
      speech_mode_enabled: true,
      include_query_screenshot: false,
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: mockGetRendererConfigStorageKey(),
        storageArea: window.localStorage,
      }));
    });

    expect(result.current.config).toEqual(
      expect.objectContaining({
        speech_mode_enabled: true,
        include_query_screenshot: false,
      }),
    );
  });

  test('ignores removed desktop assistant storage key events', () => {
    const { result } = renderAppConfigContext();
    const currentConfig = result.current.config;

    mockLoadConfigFromStorage.mockReturnValue({
      speech_mode_enabled: true,
      include_query_screenshot: false,
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'desktop-assistant-config',
        storageArea: window.localStorage,
      }));
    });

    expect(result.current.config).toBe(currentConfig);
    expect(mockLoadConfigFromStorage).toHaveBeenCalledTimes(1);
  });

  test('does not rebroadcast storage-event config changes to localStorage or settings runtime', () => {
    const { result } = renderAppConfigContext();
    mockSaveConfigToStorage.mockClear();
    mockDesktopSettingsUpdateSettings.mockClear();
    (IpcBridge.invoke as jest.Mock).mockClear();

    mockLoadConfigFromStorage.mockReturnValue({
      speech_mode_enabled: true,
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-storage-openai' },
      },
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: mockGetRendererConfigStorageKey(),
        storageArea: window.localStorage,
      }));
    });

    expect(result.current.config).toEqual(
      expect.objectContaining({
        speech_mode_enabled: true,
        provider_api_keys: expect.objectContaining({
          openai: expect.objectContaining({
            enabled: true,
            api_key: 'sk-storage-openai',
          }),
        }),
      }),
    );
    expect(mockSaveConfigToStorage).not.toHaveBeenCalled();
    expect(mockDesktopSettingsUpdateSettings).not.toHaveBeenCalled();
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.anything(),
    );
  });

  test('ignores equivalent nested provider config storage events', () => {
    mockLoadConfigFromStorage.mockReturnValue({
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-local-openai' },
      },
    });
    const { result } = renderAppConfigContext();
    const currentConfig = result.current.config;
    mockSaveConfigToStorage.mockClear();

    mockLoadConfigFromStorage.mockReturnValue({
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-local-openai' },
      },
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: mockGetRendererConfigStorageKey(),
        storageArea: window.localStorage,
      }));
    });

    expect(result.current.config).toBe(currentConfig);
    expect(mockSaveConfigToStorage).not.toHaveBeenCalled();
  });

  test('routes storage-event filtering through the config storage runtime', () => {
    renderAppConfigContext();
    mockIsRendererConfigStorageEvent.mockClear();

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'unrelated-key',
        storageArea: window.localStorage,
      }));
    });

    expect(mockIsRendererConfigStorageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'unrelated-key' }),
      window.localStorage,
    );
  });

  test('loads provider_api_keys from storage on startup', () => {
    mockLoadConfigFromStorage.mockReturnValue({
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-local-openai' },
      },
    });

    const { result } = renderAppConfigContext();

    expect(result.current.config).toEqual(
      expect.objectContaining({
        provider_api_keys: expect.objectContaining({
          openai: expect.objectContaining({
            enabled: true,
            api_key: 'sk-local-openai',
          }),
        }),
      }),
    );
  });

  test('ignores unrelated localStorage events', () => {
    const { result } = renderAppConfigContext();

    mockLoadConfigFromStorage.mockReturnValue({
      speech_mode_enabled: true,
      include_query_screenshot: false,
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'unrelated-key',
        storageArea: window.localStorage,
      }));
    });

    expect(result.current.config).toEqual(
      expect.objectContaining({
        speech_mode_enabled: false,
      }),
    );
  });

  test('derives wakewordEnabled from persisted renderer config', () => {
    mockLoadConfigFromStorage.mockReturnValue({
      wakeword_enabled: false,
    });

    const { result } = renderAppConfigContext();

    expect(result.current.wakewordEnabled).toBe(false);
    expect(result.current.wakewordActive).toBe(false);
  });

  test('binds transcript user when client user id resolves', async () => {
    setClientUserIdResponse({ userId: 'client-user-1' });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockBindTranscriptUser).toHaveBeenCalledWith('client-user-1');
    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
  });

  test('syncs current config when get-client-user-id reports already connected', async () => {
    setClientUserIdResponse({ userId: 'client-user-1', isConnected: true });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockDesktopSettingsUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ speech_mode_enabled: false }),
    );
  });

  test('syncs runtime endpoint snapshot when get-client-user-id includes endpoint metadata', async () => {
    setClientUserIdResponse({ runtimeHttpUrl: 'http://10.0.0.42:9001' });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockSyncRuntimeEndpointFromSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      runtimeHttpUrl: 'http://10.0.0.42:9001',
    }));
    expect(mockSetRuntimeEndpointHttpUrl).not.toHaveBeenCalled();
  });

  test('binds transcript user from IPC status events with userId', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getIpcListener(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ userId: 'ipc-user-1' });
    });

    expect(mockBindTranscriptUser).toHaveBeenCalledWith('ipc-user-1');
    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
  });

  test('syncs runtime endpoint snapshot from IPC status payload', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getIpcListener(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ runtimeHttpUrl: 'http://10.0.0.42:9001' });
    });

    expect(mockSyncRuntimeEndpointFromSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      runtimeHttpUrl: 'http://10.0.0.42:9001',
    }));
    expect(mockSetRuntimeEndpointHttpUrl).not.toHaveBeenCalled();
  });

  test('syncs current config to settings runtime when IPC status reports connected', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getIpcListener(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ isConnected: true });
    });

    expect(DesktopSettingsRuntimeClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ speech_mode_enabled: false }),
    );
  });

  test('does not include local-only tool log visibility in runtime sync payloads', async () => {
    mockLoadConfigFromStorage.mockReturnValue({
      show_tool_logs: true,
    });
    setClientUserIdResponse({ userId: 'client-user-1', isConnected: true });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalled();
  });

  test('does not include deferred model selection in connection sync payloads', async () => {
    mockLoadConfigFromStorage.mockReturnValue({
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    });
    setClientUserIdResponse({ userId: 'client-user-1', isConnected: true });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalled();
  });

  test('does not sync config when IPC status reports disconnected', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getIpcListener(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ isConnected: false });
    });

    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalled();
  });

  test('ignores IPC status events when userId is invalid', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getIpcListener(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ userId: '' });
    });

    expect(mockBindTranscriptUser).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
  });

  test('starts wakeword active on the main dashboard before the first visibility sync arrives', () => {
    const { result } = renderAppConfigContext();

    expect(result.current.wakewordSuppressed).toBe(false);
    expect(result.current.wakewordActive).toBe(true);
  });

  test('starts wakeword suppressed on overlay renderer views', () => {
    window.history.pushState({}, '', '/?view=minimal-chat-pill');

    const { result } = renderAppConfigContext();

    expect(result.current.wakewordSuppressed).toBe(true);
    expect(result.current.wakewordActive).toBe(false);
  });

  test('wakeword toggle events update wakewordActive state only for boolean payloads', () => {
    const { result } = renderAppConfigContext();
    expect(result.current.wakewordActive).toBe(true);

    const wakewordHandler = getIpcListener(ON_CHANNELS.WAKEWORD_TOGGLE);
    expect(wakewordHandler).toEqual(expect.any(Function));

    act(() => {
      wakewordHandler?.({ enabled: false });
    });
    expect(result.current.wakewordActive).toBe(false);

    act(() => {
      wakewordHandler?.({ enabled: 'yes' });
    });
    expect(result.current.wakewordActive).toBe(false);
  });

  test('setWakewordEnabled persists through config storage and runtime sync', async () => {
    const { result } = renderAppConfigContext();

    act(() => {
      result.current.setWakewordEnabled(false);
    });
    await flushAsyncEffects();

    expect(result.current.wakewordEnabled).toBe(false);
    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        wakeword_enabled: false,
      }),
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.objectContaining({
        wakeword_enabled: false,
      }),
    );
    expect(DesktopSettingsRuntimeClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        wakeword_enabled: false,
      }),
    );
  });

  test('warns when disk config load fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any) => {
      if (channel === INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG) {
        throw new Error('disk-load-failed');
      }
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return null;
      }
      return null;
    });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(warnSpy).toHaveBeenCalledWith(
      '[Config] Failed to load config from disk:',
      'disk-load-failed',
    );
    warnSpy.mockRestore();
  });

  test('warns when save-to-disk invoke fails during updateConfig', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any) => {
      if (channel === INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG) {
        return null;
      }
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return null;
      }
      if (channel === INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG) {
        throw new Error('disk-save-failed');
      }
      return null;
    });

    const { result } = renderAppConfigContext();

    act(() => {
      result.current.updateConfig({
        speech_mode_enabled: false,
        selected_model_id: 'model-save-err',
        model_provider: 'openai',
      });
    });
    await flushAsyncEffects();

    expect(warnSpy).toHaveBeenCalledWith(
      '[Settings Update] Failed to save config to disk:',
      'disk-save-failed',
    );
    warnSpy.mockRestore();
  });

  test('persists redacted provider credential status to local storage and raw keys to main', async () => {
    const { result } = renderAppConfigContext();

    act(() => {
      result.current.updateConfig({
        provider_api_keys: {
          openai: { enabled: true, api_key: 'sk-persist-openai' },
          google: { enabled: true, api_key: 'google-persist' },
        },
      });
    });
    await flushAsyncEffects();

    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_api_keys: expect.objectContaining({
          openai: expect.objectContaining({
            enabled: true,
            api_key: '',
          }),
          google: expect.objectContaining({
            enabled: true,
            api_key: '',
          }),
        }),
      }),
    );

    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.objectContaining({
        provider_api_keys: expect.objectContaining({
          openai: expect.objectContaining({
            enabled: true,
            api_key: 'sk-persist-openai',
          }),
        }),
      }),
    );
    expect(JSON.stringify(mockSaveConfigToStorage.mock.calls)).not.toContain('sk-persist-openai');
    expect(JSON.stringify((IpcBridge.invoke as jest.Mock).mock.calls)).toContain('google-persist');
    expect(DesktopSettingsRuntimeClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_api_keys: expect.objectContaining({
          openai: expect.objectContaining({
            enabled: true,
            api_key: 'sk-persist-openai',
          }),
        }),
      }),
    );
  });

  test('persists global stop shortcut locally without syncing it to runtime settings', async () => {
    const { result } = renderAppConfigContext();

    act(() => {
      result.current.updateConfig({
        global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      });
    });
    await flushAsyncEffects();

    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      }),
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.objectContaining({
        global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      }),
    );
    expect(DesktopSettingsRuntimeClient.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      }),
    );
  });

  test('applies global stop shortcut fallback from IPC status and persists the resolved binding', async () => {
    const { result } = renderAppConfigContext();
    await flushAsyncEffects();

    const ipcStatusHandler = getIpcListener(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({
        globalAgentStopShortcutStatus: {
          requestedAccelerator: 'CommandOrControl+Alt+.',
          resolvedAccelerator: 'CommandOrControl+Shift+.',
          registeredAccelerator: null,
          usingFallback: true,
          registrationFailed: false,
          supportedAccelerators: [
            'CommandOrControl+Alt+.',
            'CommandOrControl+Shift+.',
          ],
        },
      });
    });

    expect(result.current.config).toEqual(expect.objectContaining({
      global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
    }));
    expect(result.current.globalAgentStopShortcutStatus).toEqual(expect.objectContaining({
      usingFallback: true,
      resolvedAccelerator: 'CommandOrControl+Shift+.',
    }));
    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
      }),
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.objectContaining({
        global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
      }),
    );
  });

  test('clears global stop shortcut status when IPC status omits a status object', async () => {
    const { result } = renderAppConfigContext();
    await flushAsyncEffects();

    const ipcStatusHandler = getIpcListener(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({
        globalAgentStopShortcutStatus: {
          usingFallback: true,
          resolvedAccelerator: 'CommandOrControl+Shift+.',
        },
      });
    });
    expect(result.current.globalAgentStopShortcutStatus).toEqual(expect.objectContaining({
      usingFallback: true,
    }));

    act(() => {
      ipcStatusHandler?.({
        globalAgentStopShortcutStatus: 'unavailable',
      });
    });

    expect(result.current.globalAgentStopShortcutStatus).toBeNull();
  });
});
