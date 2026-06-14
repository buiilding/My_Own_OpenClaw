/**
 * Covers desktop settings runtime client. behavior in the frontend test suite.
 */

import { DesktopSettingsRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient';

const mockInvokeWindieCommand = jest.fn(async () => undefined);

jest.mock('../../frontend/src/renderer/app/runtime/windieCommandInvokeClient', () => {
  return {
    invokeWindieCommand: (...args: unknown[]) => mockInvokeWindieCommand(...args),
  };
});

describe('DesktopSettingsRuntimeClient', () => {
  beforeEach(() => {
    mockInvokeWindieCommand.mockReset();
    mockInvokeWindieCommand.mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/');
    DesktopSettingsRuntimeClient.resetDashboardStartupModelListForTests();
  });

  test('requests model lists through the desktop backend transport', () => {
    DesktopSettingsRuntimeClient.listModels();

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('models.list');
  });

  test('requests dashboard startup model list only once per renderer session', () => {
    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(true);
    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(false);

    expect(mockInvokeWindieCommand).toHaveBeenCalledTimes(1);
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('models.list');
  });

  test('skips dashboard startup model list from secondary renderer views', () => {
    window.history.replaceState({}, '', '/?view=minimal-response-overlay');

    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(false);

    expect(mockInvokeWindieCommand).not.toHaveBeenCalled();
  });

  test('does not throw when startup model list request fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockInvokeWindieCommand.mockRejectedValueOnce(new Error('ipc unavailable'));

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

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('settings.update', {
      speech_mode_enabled: true,
    });
  });

  test('sends model changes through the SDK model settings contract', () => {
    DesktopSettingsRuntimeClient.setModel({
      modelId: ' gpt-5.4@@gpt-5-4-high-thinking ',
      modelProvider: ' openai ',
    });

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('settings.update', {
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
    });
  });
});
