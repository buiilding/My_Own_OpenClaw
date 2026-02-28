import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { isMainWindowVisible } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/windowVisibility';

describe('surfaceOrchestrator windowVisibility', () => {
  beforeEach(() => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true, data: { visible: false } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns true only when visibility response is success+visible', async () => {
    (IpcBridge.invoke as jest.Mock).mockResolvedValueOnce({ success: true, data: { visible: true } });
    await expect(isMainWindowVisible()).resolves.toBe(true);
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY);
  });

  test('returns false for non-visible or unsuccessful responses', async () => {
    (IpcBridge.invoke as jest.Mock).mockResolvedValueOnce({ success: true, data: { visible: false } });
    await expect(isMainWindowVisible()).resolves.toBe(false);

    (IpcBridge.invoke as jest.Mock).mockResolvedValueOnce({ success: false, data: { visible: true } });
    await expect(isMainWindowVisible()).resolves.toBe(false);
  });

  test('returns false for malformed visibility payloads', async () => {
    (IpcBridge.invoke as jest.Mock).mockResolvedValueOnce({ success: true, data: null });
    await expect(isMainWindowVisible()).resolves.toBe(false);
  });

  test('returns false when visibility probe throws', async () => {
    (IpcBridge.invoke as jest.Mock).mockRejectedValueOnce(new Error('ipc-failed'));
    await expect(isMainWindowVisible()).resolves.toBe(false);
  });
});
