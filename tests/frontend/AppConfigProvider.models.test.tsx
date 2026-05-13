import {
  act,
  ApiClient,
  flushAsyncEffects,
  getBackendHandler,
  getRemoveBackendListenerMock,
  INVOKE_CHANNELS,
  IpcBridge,
  mockLoadConfigFromStorage,
  mockSaveConfigToStorage,
  mockUseSettingsManagement,
  ON_CHANNELS,
  registerAppConfigProviderSuiteLifecycle,
  renderAppConfigContext,
  SEND_CHANNELS,
  setClientUserIdResponse,
} from './AppConfigProvider.testUtils';

registerAppConfigProviderSuiteLifecycle();

describe('AppConfigProvider model + config wiring', () => {
  function setupModelsListedHandlerHarness() {
    const settingsHandlers = {
      handleModelsListed: jest.fn(),
    };
    mockUseSettingsManagement.mockReturnValue(settingsHandlers);
    renderAppConfigContext();

    const backendHandler = getBackendHandler(ON_CHANNELS.FROM_BACKEND);
    expect(backendHandler).toEqual(expect.any(Function));

    return { settingsHandlers, backendHandler };
  }

  test('registers backend listener before requesting model list after connect', () => {
    renderAppConfigContext();

    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.FROM_BACKEND,
      expect.any(Function),
    );
    expect(IpcBridge.send).not.toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      { type: 'list-models' },
    );

    act(() => {
      getBackendHandler(ON_CHANNELS.IPC_STATUS)?.({ isConnected: true });
    });

    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      { type: 'list-models' },
    );
  });

  test('does not request model list from chatbox-response view', () => {
    window.history.pushState({}, '', '/?view=chatbox-response');

    renderAppConfigContext();
    act(() => {
      getBackendHandler(ON_CHANNELS.IPC_STATUS)?.({ isConnected: true });
    });

    expect(IpcBridge.send).not.toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      { type: 'list-models' },
    );
  });

  test('requests model list only once per renderer session', () => {
    const firstRender = renderAppConfigContext();
    act(() => {
      getBackendHandler(ON_CHANNELS.IPC_STATUS)?.({ isConnected: true });
    });
    firstRender.unmount();
    renderAppConfigContext();
    act(() => {
      getBackendHandler(ON_CHANNELS.IPC_STATUS)?.({ isConnected: true });
    });

    const listModelCalls = (IpcBridge.send as jest.Mock).mock.calls.filter(
      ([channel, payload]) => channel === SEND_CHANNELS.TO_BACKEND && payload?.type === 'list-models',
    );
    expect(listModelCalls).toHaveLength(1);
  });

  test('requests model list from initial connected backend snapshot', async () => {
    setClientUserIdResponse({ isConnected: true });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      { type: 'list-models' },
    );
  });

  test('routes models-listed event to settings handler', () => {
    const { settingsHandlers, backendHandler } = setupModelsListedHandlerHarness();

    act(() => {
      backendHandler?.({
        type: 'models-listed',
        payload: {
          local_models: ['local-a'],
          online_models: ['online-b'],
        },
      });
    });

    expect(settingsHandlers.handleModelsListed).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'models-listed' }),
    );
  });

  test('ignores unsupported backend events', () => {
    const { settingsHandlers, backendHandler } = setupModelsListedHandlerHarness();

    act(() => {
      backendHandler?.({
        type: 'status-updated',
        payload: { status: 'ok' },
      });
    });

    expect(settingsHandlers.handleModelsListed).not.toHaveBeenCalled();
  });

  test('skips persistence when updateConfig receives same config', () => {
    const { result } = renderAppConfigContext();

    act(() => {
      result.current.updateConfig({ speech_mode_enabled: false });
    });

    expect(mockSaveConfigToStorage).not.toHaveBeenCalled();
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.anything(),
    );
    expect(((ApiClient.updateSettings as jest.Mock).mock.calls || []).length).toBe(0);
  });

  test('removes backend listener on unmount', () => {
    const { unmount } = renderAppConfigContext();

    unmount();

    expect(getRemoveBackendListenerMock()).toHaveBeenCalled();
  });

  test('keeps updateConfig callback stable across config updates', () => {
    const { result } = renderAppConfigContext();
    const firstUpdateConfig = result.current.updateConfig;

    act(() => {
      result.current.updateConfig({
        speech_mode_enabled: false,
        selected_model_id: 'model-y',
        model_provider: 'openai',
      });
    });

    expect(result.current.updateConfig).toBe(firstUpdateConfig);
  });

  test('updateConfig merges partial updates with existing config', () => {
    const { result } = renderAppConfigContext();

    act(() => {
      result.current.updateConfig({ selected_model_id: 'model-merged' });
    });

    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        speech_mode_enabled: false,
        selected_model_id: 'model-merged',
      }),
      expect.any(Number),
    );
    expect(((ApiClient.updateSettings as jest.Mock).mock.calls || []).length).toBe(0);
  });

  test('keeps model-only config changes local until a query is sent', () => {
    const { result } = renderAppConfigContext();

    act(() => {
      result.current.updateConfig({
        selected_model_id: 'claude-sonnet-4-5',
        model_provider: 'anthropic',
      });
    });

    expect(mockSaveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_model_id: 'claude-sonnet-4-5',
        model_provider: 'anthropic',
      }),
      expect.any(Number),
    );
    expect(((ApiClient.updateSettings as jest.Mock).mock.calls || []).length).toBe(0);
  });

  test('registerSaveStatusCallback is invoked before persisting changed config', () => {
    const { result } = renderAppConfigContext();
    const callback = jest.fn();

    act(() => {
      result.current.registerSaveStatusCallback(callback);
      result.current.updateConfig({ selected_model_id: 'model-callback' });
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
