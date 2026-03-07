import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { invokeTool } from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionInvoker';

describe('ToolExecutionInvoker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normalizes screenshot args to plain object without injecting display bounds in renderer', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValue({ success: true, data: {} } as any);

    await invokeTool('screenshot', { wait: 1 }, false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        wait: 1,
      },
      skipAutoCapture: false,
    });
  });

  test('does not inject display bounds for other tools', async () => {
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

  test('normalizes screenshot args to object when args is null', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValue({ success: true, data: {} } as any);

    await invokeTool('screenshot', null, false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {},
      skipAutoCapture: false,
    });
  });

  test('normalizes invalid screenshot args to object', async () => {
    const invokeSpy = jest
      .spyOn(IpcBridge, 'invoke')
      .mockResolvedValue({ success: true, data: {} } as any);

    await invokeTool('screenshot', 'invalid-args', false);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {},
      skipAutoCapture: false,
    });
  });
});
