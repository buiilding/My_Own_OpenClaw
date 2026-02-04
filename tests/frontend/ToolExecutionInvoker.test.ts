import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { invokeTool } from '../../frontend/src/renderer/infrastructure/services/ToolExecutionInvoker';
import { DISPLAY_BOUNDS_STORAGE_KEY } from '../../frontend/src/renderer/utils/displaySelection';

describe('ToolExecutionInvoker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('injects display bounds for screenshot tool', async () => {
    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 1, y: 2, width: 3, height: 4 }),
    );
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValue({ success: true, data: {} } as any);

    await invokeTool('screenshot', { wait: 1 }, false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        wait: 1,
        display_bounds: { x: 1, y: 2, width: 3, height: 4 },
      },
      skipAutoCapture: false,
    });
  });

  test('does not inject display bounds for other tools', async () => {
    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 5, y: 6, width: 7, height: 8 }),
    );
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValue({ success: true, data: {} } as any);

    await invokeTool('read_file', { file_path: '/tmp/a' }, false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
      skipAutoCapture: false,
    });
  });
});
