import { DesktopSettingsRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient';
import { IpcBridge, SEND_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => {
  const actual = jest.requireActual('../../frontend/src/renderer/infrastructure/ipc/bridge');
  return {
    ...actual,
    IpcBridge: {
      ...actual.IpcBridge,
      send: jest.fn(),
    },
  };
});

describe('DesktopSettingsRuntimeClient', () => {
  const mockSend = IpcBridge.send as jest.MockedFunction<typeof IpcBridge.send>;

  beforeEach(() => {
    mockSend.mockReset();
  });

  test('requests model lists through the desktop backend transport', () => {
    DesktopSettingsRuntimeClient.listModels();

    expect(mockSend).toHaveBeenCalledWith(SEND_CHANNELS.TO_BACKEND, {
      type: 'list-models',
    });
  });

  test('sends settings patches through the desktop backend transport', () => {
    DesktopSettingsRuntimeClient.updateSettings({
      speech_mode_enabled: true,
    });

    expect(mockSend).toHaveBeenCalledWith(SEND_CHANNELS.TO_BACKEND, {
      type: 'update-settings',
      payload: {
        speech_mode_enabled: true,
      },
    });
  });

  test('sends model changes through the SDK model settings contract', () => {
    DesktopSettingsRuntimeClient.setModel({
      modelId: ' gpt-5.4@@gpt-5-4-high-thinking ',
      modelProvider: ' openai ',
    });

    expect(mockSend).toHaveBeenCalledWith(SEND_CHANNELS.TO_BACKEND, {
      type: 'update-settings',
      payload: {
        selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
        model_provider: 'openai',
      },
    });
  });
});
