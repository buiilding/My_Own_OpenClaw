import {
  act,
  ApiClient,
  flushAsyncEffects,
  getBackendHandler,
  INVOKE_CHANNELS,
  IpcBridge,
  mockApiClientUpdateSettings,
  mockLoadConfigFromStorage,
  mockSaveConfigToStorage,
  mockSetBackendHttpUrl,
  mockUpdateTranscriptSession,
  ON_CHANNELS,
  registerAppConfigProviderSuiteLifecycle,
  renderAppConfigContext,
  setClientUserIdResponse,
  setLoadFrontendConfigResponse,
} from './AppConfigProvider.testUtils';

registerAppConfigProviderSuiteLifecycle();

describe('AppConfigProvider storage + IPC status handling', () => {
  test('skips disk-sync writes when disk config matches stored config', async () => {
    setLoadFrontendConfigResponse({ voice_mode_enabled: false });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockSaveConfigToStorage).not.toHaveBeenCalled();
    expect(ApiClient.updateSettings).not.toHaveBeenCalled();
  });

  test('applies disk config when it differs from stored config', async () => {
    setLoadFrontendConfigResponse({
      voice_mode_enabled: true,
      selected_model_id: 'model-x',
      model_provider: 'openai',
    });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_mode_enabled: true,
        selected_model_id: 'model-x',
        model_provider: 'openai',
      }),
      expect.any(Number),
    );
    expect(ApiClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_mode_enabled: true,
        selected_model_id: 'model-x',
        model_provider: 'openai',
      }),
    );
  });

  test('applies cross-window config changes from localStorage events', () => {
    const { result } = renderAppConfigContext();

    mockLoadConfigFromStorage.mockReturnValue({
      voice_mode_enabled: true,
      include_query_screenshot: false,
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'desktop-assistant-config',
        storageArea: window.localStorage,
      }));
    });

    expect(result.current.config).toEqual(
      expect.objectContaining({
        voice_mode_enabled: true,
        include_query_screenshot: false,
      }),
    );
  });

  test('loads provider_api_keys from storage on startup', () => {
    mockLoadConfigFromStorage.mockReturnValue({
      voice_mode_enabled: false,
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
      voice_mode_enabled: true,
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
        voice_mode_enabled: false,
      }),
    );
  });

  test('updates transcript session when client user id resolves', async () => {
    setClientUserIdResponse({ userId: 'client-user-1' });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(undefined, 'client-user-1');
  });

  test('syncs current config when get-client-user-id reports already connected', async () => {
    setClientUserIdResponse({ userId: 'client-user-1', isConnected: true });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockApiClientUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ voice_mode_enabled: false }),
    );
  });

  test('sets artifact backend http URL when get-client-user-id includes endpoint metadata', async () => {
    setClientUserIdResponse({ backendHttpUrl: 'http://10.0.0.42:9001' });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockSetBackendHttpUrl).toHaveBeenCalledWith('http://10.0.0.42:9001');
  });

  test('updates transcript session from IPC status events with userId', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getBackendHandler(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ userId: 'ipc-user-1' });
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(undefined, 'ipc-user-1');
  });

  test('sets artifact backend http URL from IPC status payload', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getBackendHandler(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ backendHttpUrl: 'http://10.0.0.42:9001' });
    });

    expect(mockSetBackendHttpUrl).toHaveBeenCalledWith('http://10.0.0.42:9001');
  });

  test('syncs current config to backend when IPC status reports connected', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getBackendHandler(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ isConnected: true });
    });

    expect(ApiClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ voice_mode_enabled: false }),
    );
  });

  test('does not sync config when IPC status reports disconnected', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getBackendHandler(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ isConnected: false });
    });

    expect(ApiClient.updateSettings).not.toHaveBeenCalled();
  });

  test('ignores IPC status events when userId is invalid', () => {
    renderAppConfigContext();

    const ipcStatusHandler = getBackendHandler(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ userId: '' });
    });

    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
  });

  test('wakeword toggle events update wakewordActive state only for boolean payloads', () => {
    const { result } = renderAppConfigContext();
    expect(result.current.wakewordActive).toBe(false);

    const wakewordHandler = getBackendHandler(ON_CHANNELS.WAKEWORD_TOGGLE);
    expect(wakewordHandler).toEqual(expect.any(Function));

    act(() => {
      wakewordHandler?.({ enabled: true });
    });
    expect(result.current.wakewordActive).toBe(true);

    act(() => {
      wakewordHandler?.({ enabled: 'yes' });
    });
    expect(result.current.wakewordActive).toBe(true);
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
        voice_mode_enabled: false,
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

  test('persists provider_api_keys updates to local storage and disk', async () => {
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
            api_key: 'sk-persist-openai',
          }),
          google: expect.objectContaining({
            enabled: true,
            api_key: 'google-persist',
          }),
        }),
      }),
      expect.any(Number),
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
  });
});
