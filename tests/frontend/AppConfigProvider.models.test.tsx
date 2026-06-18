/**
 * Covers app config provider.models. behavior in the frontend test suite.
 */

import {
  act,
  DesktopSettingsRuntimeClient,
  flushAsyncEffects,
  getIpcListener,
  getRemoveIpcListenerMock,
  INVOKE_CHANNELS,
  IpcBridge,
  mockDesktopSettingsListModels,
  mockDesktopSettingsRequestStartupModels,
  mockLoadConfigFromStorage,
  mockSaveConfigToStorage,
  mockUseDesktopSettingsEventHandlers,
  ON_CHANNELS,
  registerAppConfigProviderSuiteLifecycle,
  renderAppConfigContext,
  setClientUserIdResponse,
} from './AppConfigProvider.testUtils';

registerAppConfigProviderSuiteLifecycle();

describe('AppConfigProvider model + config wiring', () => {
  function setupModelsListedHandlerHarness() {
    const settingsHandlers = {
      handleModelsListed: jest.fn(),
    };
    mockUseDesktopSettingsEventHandlers.mockReturnValue(settingsHandlers);
    renderAppConfigContext();

    const settingsEventListener = getIpcListener(ON_CHANNELS.BACKEND_SETTINGS_EVENT);
    expect(settingsEventListener).toEqual(expect.any(Function));

    return { settingsHandlers, settingsEventListener };
  }

  test('registers settings event listener before requesting model list on dashboard startup', () => {
    renderAppConfigContext();

    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.BACKEND_SETTINGS_EVENT,
      expect.any(Function),
    );
    expect(mockDesktopSettingsRequestStartupModels).toHaveBeenCalledTimes(1);
    expect(mockDesktopSettingsListModels).not.toHaveBeenCalled();
  });

  test('delegates secondary view model-list decisions to the settings runtime', () => {
    window.history.pushState({}, '', '/?view=minimal-response-overlay');

    renderAppConfigContext();

    expect(mockDesktopSettingsRequestStartupModels).toHaveBeenCalledTimes(1);
    expect(mockDesktopSettingsListModels).not.toHaveBeenCalled();
  });

  test('delegates each provider mount to settings runtime while reconnect does not request models directly', () => {
    const firstRender = renderAppConfigContext();
    firstRender.unmount();
    renderAppConfigContext();
    act(() => {
      getIpcListener(ON_CHANNELS.IPC_STATUS)?.({ isConnected: true });
    });

    expect(mockDesktopSettingsRequestStartupModels).toHaveBeenCalledTimes(2);
    expect(mockDesktopSettingsListModels).not.toHaveBeenCalled();
  });

  test('requests model list even when initial runtime snapshot is disconnected', async () => {
    setClientUserIdResponse({ isConnected: false });

    renderAppConfigContext();
    await flushAsyncEffects();

    expect(mockDesktopSettingsRequestStartupModels).toHaveBeenCalledTimes(1);
    expect(mockDesktopSettingsListModels).not.toHaveBeenCalled();
  });

  test('routes models-listed event to settings handler', () => {
    const { settingsHandlers, settingsEventListener } = setupModelsListedHandlerHarness();

    act(() => {
      settingsEventListener?.({
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

  test('ignores unsupported settings events', () => {
    const { settingsHandlers, settingsEventListener } = setupModelsListedHandlerHarness();

    act(() => {
      settingsEventListener?.({
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
    expect(((DesktopSettingsRuntimeClient.updateSettings as jest.Mock).mock.calls || []).length).toBe(0);
  });

  test('removes IPC listener on unmount', () => {
    const { unmount } = renderAppConfigContext();

    unmount();

    expect(getRemoveIpcListenerMock()).toHaveBeenCalled();
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
    );
    expect(((DesktopSettingsRuntimeClient.updateSettings as jest.Mock).mock.calls || []).length).toBe(0);
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
    );
    expect(((DesktopSettingsRuntimeClient.updateSettings as jest.Mock).mock.calls || []).length).toBe(0);
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
