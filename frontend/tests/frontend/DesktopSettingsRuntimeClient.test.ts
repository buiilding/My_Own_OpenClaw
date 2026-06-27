/**
 * Covers settings app-runtime client behavior in the frontend test suite.
 */

import { DesktopSettingsRuntimeClient } from '../../src/renderer/app/runtime/desktopSettingsRuntimeClient';

const mockInvokeAgentSdkCommand = jest.fn(async () => undefined);

jest.mock('../../src/renderer/app/runtime/agentSdkCommandInvokeClient', () => {
  return {
    AgentSdkCommandInvokeClient: {
      invokeAgentSdkCommand: (...args: unknown[]) => mockInvokeAgentSdkCommand(...args),
    },
  };
});

describe('DesktopSettingsRuntimeClient', () => {
  beforeEach(() => {
    mockInvokeAgentSdkCommand.mockReset();
    mockInvokeAgentSdkCommand.mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/');
    DesktopSettingsRuntimeClient.resetDashboardStartupModelListForTests();
  });

  test('requests model lists through the SDK desktop transport adapter', () => {
    DesktopSettingsRuntimeClient.listModels();

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('models.list');
  });

  test('requests dashboard startup model list only once per renderer session', () => {
    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(true);
    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(false);

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledTimes(1);
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('models.list');
    expect(
      (window as Window & {
        __desktop_agent_models_list_requested__?: boolean;
        __desktop_runtime_models_list_requested__?: boolean;
      }).__desktop_agent_models_list_requested__,
    ).toBeUndefined();
    expect(
      (window as Window & {
        __desktop_runtime_models_list_requested__?: boolean;
      }).__desktop_runtime_models_list_requested__,
    ).toBe(true);
  });

  test('skips dashboard startup model list from secondary renderer views', () => {
    window.history.replaceState({}, '', '/?view=minimal-response-overlay');

    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(false);

    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

  test('does not throw when startup model list request fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockInvokeAgentSdkCommand.mockRejectedValueOnce(new Error('ipc unavailable'));

    expect(DesktopSettingsRuntimeClient.requestDashboardStartupModelList()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).toHaveBeenCalledWith(
      '[SettingsRuntime] Failed to request startup model list:',
      'ipc unavailable',
    );

    warnSpy.mockRestore();
  });

  test('sends settings patches through the SDK desktop transport adapter', async () => {
    await DesktopSettingsRuntimeClient.updateSettings({
      speech_mode_enabled: true,
    });

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('settings.update', {
      speech_mode_enabled: true,
    });
  });

  test('sends model changes through the SDK model settings contract', async () => {
    await DesktopSettingsRuntimeClient.setModel({
      modelId: ' gpt-5.4@@gpt-5-4-high-thinking ',
      modelProvider: ' openai ',
    });

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('settings.update', {
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
    });
  });
});
