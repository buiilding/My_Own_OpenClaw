import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
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

describe('ApiClient.setModel', () => {
  const mockSend = IpcBridge.send as jest.MockedFunction<typeof IpcBridge.send>;

  beforeEach(() => {
    mockSend.mockReset();
  });

  test('sends model changes through the SDK model settings contract', () => {
    ApiClient.setModel({
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
