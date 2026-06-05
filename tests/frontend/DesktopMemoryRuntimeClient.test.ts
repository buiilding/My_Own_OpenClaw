import { DesktopMemoryRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopMemoryRuntimeClient';
import { invokeWindieCommand } from '../../frontend/src/renderer/app/runtime/windieCommandInvokeClient';

jest.mock('../../frontend/src/renderer/app/runtime/windieCommandInvokeClient', () => ({
  invokeWindieCommand: jest.fn(),
}));

const mockInvokeWindieCommand = invokeWindieCommand as jest.MockedFunction<typeof invokeWindieCommand>;

describe('DesktopMemoryRuntimeClient', () => {
  beforeEach(() => {
    mockInvokeWindieCommand.mockReset();
  });

  test('lists episodic and semantic memories through SDK-shaped commands', async () => {
    mockInvokeWindieCommand
      .mockResolvedValueOnce({ memories: [{ id: 'ep-1' }] })
      .mockResolvedValueOnce({ memories: [{ id: 'sem-1' }] });

    await expect(DesktopMemoryRuntimeClient.listEpisodicMemories(25)).resolves.toEqual([{ id: 'ep-1' }]);
    await expect(DesktopMemoryRuntimeClient.listSemanticMemories(10)).resolves.toEqual([{ id: 'sem-1' }]);

    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(1, 'memories.list', {
      type: 'episodic',
      limit: 25,
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(2, 'memories.list', {
      type: 'semantic',
      limit: 10,
    });
  });

  test('maps delete requests by memory kind and rejects failed deletes', async () => {
    mockInvokeWindieCommand
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce({ deleted: false });

    await expect(DesktopMemoryRuntimeClient.deleteMemoryItem({
      memoryId: 'sem-1',
      kind: 'semantic',
    })).resolves.toBeUndefined();

    await expect(DesktopMemoryRuntimeClient.deleteMemoryItem({
      memoryId: 'ep-1',
      kind: 'episodic',
    })).rejects.toThrow('episodic memory was not deleted');

    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(1, 'memories.delete', {
      type: 'semantic',
      memoryId: 'sem-1',
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(2, 'memories.delete', {
      type: 'episodic',
      memoryId: 'ep-1',
    });
  });

  test('clears memory and chat history through SDK-shaped commands', async () => {
    mockInvokeWindieCommand
      .mockResolvedValueOnce({ deleted: 3 })
      .mockResolvedValueOnce({ deleted: 4 });

    await expect(DesktopMemoryRuntimeClient.clearLocalMemory()).resolves.toEqual({ deleted: 3 });
    await expect(DesktopMemoryRuntimeClient.clearChatHistory('user-1')).resolves.toEqual({ deleted: 4 });

    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(1, 'memories.clearAll', {});
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(2, 'conversations.clearAll', {
      userId: 'user-1',
    });
  });
});
