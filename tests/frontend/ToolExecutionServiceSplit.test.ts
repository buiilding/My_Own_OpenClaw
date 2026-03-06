jest.mock(
  '../../frontend/src/renderer/infrastructure/services/toolExecution/singleToolExecution',
  () => ({
    executeSingleTool: jest.fn().mockResolvedValue({ correlationId: 'single' }),
  }),
);

jest.mock(
  '../../frontend/src/renderer/infrastructure/services/toolExecution/bundleExecution',
  () => ({
    executeToolBundleRuntime: jest.fn().mockResolvedValue({ correlationId: 'bundle' }),
  }),
);

import { ToolExecutionService } from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionService';
import { executeSingleTool } from '../../frontend/src/renderer/infrastructure/services/toolExecution/singleToolExecution';
import { executeToolBundleRuntime } from '../../frontend/src/renderer/infrastructure/services/toolExecution/bundleExecution';

describe('ToolExecutionService split delegates', () => {
  test('executeTool delegates to singleToolExecution with current callbacks', async () => {
    const callbacks = { sendToBackend: jest.fn() };
    const service = new ToolExecutionService(callbacks);
    await service.executeTool('read_file', { file_path: '/tmp/a' }, { correlationId: 'req-1' });

    expect(executeSingleTool).toHaveBeenCalledWith(
      callbacks,
      'read_file',
      { file_path: '/tmp/a' },
      { correlationId: 'req-1' },
    );
  });

  test('setCallbacks merges new callbacks before bundle execution', async () => {
    const firstCallbacks = { sendToBackend: jest.fn() };
    const onBundleResult = jest.fn();
    const service = new ToolExecutionService(firstCallbacks);
    service.setCallbacks({ onBundleResult });
    await service.executeToolBundle([{ toolName: 'read_file', args: {} }], 'bundle-1');

    expect(executeToolBundleRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        sendToBackend: firstCallbacks.sendToBackend,
        onBundleResult,
      }),
      [{ toolName: 'read_file', args: {} }],
      'bundle-1',
    );
  });
});
