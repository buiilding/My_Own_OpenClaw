import { DesktopSettingsRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => {
  const actual = jest.requireActual('../../frontend/src/renderer/infrastructure/ipc/bridge');
  return {
    ...actual,
    IpcBridge: {
      ...actual.IpcBridge,
      invoke: jest.fn(async () => undefined),
    },
  };
});

describe('DesktopSettingsRuntimeClient', () => {
  const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/');
    DesktopSettingsRuntimeClient.resetDashboardStartupModelListForTests();
  });

  test('requests model lists through the desktop backend transport', () => {
    DesktopSettingsRuntimeClient.listModels();

    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.WINDIE_LIST_MODELS);
  });

  test('requests dashboard startup model list only once per renderer session', () => {
    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(true);
    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(false);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.WINDIE_LIST_MODELS);
  });

  test('skips dashboard startup model list from secondary renderer views', () => {
    window.history.replaceState({}, '', '/?view=chatbox-response');

    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(false);

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('does not throw when startup model list request fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockInvoke.mockRejectedValueOnce(new Error('ipc unavailable'));

    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).toHaveBeenCalledWith(
      '[SettingsRuntime] Failed to request startup model list:',
      'ipc unavailable',
    );

    warnSpy.mockRestore();
  });

  test('sends settings patches through the desktop backend transport', () => {
    DesktopSettingsRuntimeClient.updateSettings({
      speech_mode_enabled: true,
    });

    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.WINDIE_UPDATE_SETTINGS, {
      speech_mode_enabled: true,
    });
  });

  test('sends model changes through the SDK model settings contract', () => {
    DesktopSettingsRuntimeClient.setModel({
      modelId: ' gpt-5.4@@gpt-5-4-high-thinking ',
      modelProvider: ' openai ',
    });

    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.WINDIE_UPDATE_SETTINGS, {
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
    });
  });
});
