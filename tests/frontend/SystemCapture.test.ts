import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';

describe('SystemCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('extractOSstate returns system state and screenshot for first user message', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ active_window: 'App', mouse_position: '0,0' })
      .mockResolvedValueOnce({ success: true, data: { screenshot: 'shot' } });

    const result = await extractOSstate(true, true, 0, true);

    expect(invokeSpy).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position', 'screen_resolution', 'windows'],
    });
    expect(invokeSpy).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Initial user message screenshot',
        expectation: 'Current screen state',
      },
      skipAutoCapture: false,
    });
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '0,0' });
    expect(result.screenshot).toBe('shot');
  });

  test('extractOSstate handles system-state-only capture', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValueOnce({ active_window: 'App', mouse_position: '1,1' });

    const result = await extractOSstate(false, true, 0, false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['active_window', 'mouse_position'],
    });
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '1,1' });
    expect(result.screenshot).toBeNull();
  });
});
