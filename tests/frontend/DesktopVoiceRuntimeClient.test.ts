import { DesktopVoiceRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopVoiceRuntimeClient';
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

describe('DesktopVoiceRuntimeClient', () => {
  const mockSend = IpcBridge.send as jest.MockedFunction<typeof IpcBridge.send>;

  beforeEach(() => {
    mockSend.mockReset();
  });

  test('sends wakeword notifications through the desktop backend transport', () => {
    DesktopVoiceRuntimeClient.wakewordDetected();

    expect(mockSend).toHaveBeenCalledWith(SEND_CHANNELS.TO_BACKEND, {
      type: 'wakeword-detected',
      payload: {},
    });
  });
});
