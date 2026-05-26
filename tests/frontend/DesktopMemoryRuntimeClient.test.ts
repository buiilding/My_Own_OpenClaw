import { DesktopMemoryRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopMemoryRuntimeClient';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    LIST_EPISODIC_MEMORIES: 'list-episodic-memories',
    LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
    DELETE_EPISODIC_MEMORY: 'delete-episodic-memory',
    DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory',
    CLEAR_LOCAL_MEMORY: 'clear-local-memory',
    CLEAR_CHAT_HISTORY: 'clear-chat-history',
  },
}));

const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

describe('DesktopMemoryRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('lists episodic and semantic memories through owned IPC channels', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: { memories: [{ id: 'ep-1' }] } })
      .mockResolvedValueOnce({ success: true, data: { memories: [{ id: 'sem-1' }] } });

    await expect(DesktopMemoryRuntimeClient.listEpisodicMemories('user-1', 25)).resolves.toEqual([{ id: 'ep-1' }]);
    await expect(DesktopMemoryRuntimeClient.listSemanticMemories('user-1', 10)).resolves.toEqual([{ id: 'sem-1' }]);

    expect(mockInvoke).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.LIST_EPISODIC_MEMORIES, {
      userId: 'user-1',
      limit: 25,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.LIST_SEMANTIC_MEMORIES, {
      userId: 'user-1',
      limit: 10,
    });
  });

  test('maps delete requests by memory kind and rejects failed deletes', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: { deleted: true } })
      .mockResolvedValueOnce({ success: true, data: { deleted: false } });

    await expect(DesktopMemoryRuntimeClient.deleteMemoryItem({
      userId: 'user-1',
      memoryId: 'sem-1',
      kind: 'semantic',
    })).resolves.toBeUndefined();

    await expect(DesktopMemoryRuntimeClient.deleteMemoryItem({
      userId: 'user-1',
      memoryId: 'ep-1',
      kind: 'episodic',
    })).rejects.toThrow('episodic memory was not deleted');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.DELETE_SEMANTIC_MEMORY, {
      userId: 'user-1',
      memoryId: 'sem-1',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.DELETE_EPISODIC_MEMORY, {
      userId: 'user-1',
      memoryId: 'ep-1',
    });
  });

  test('clears memory and chat history through the facade', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: { deleted: 3 } })
      .mockResolvedValueOnce({ success: true, data: { deleted: 4 } });

    await expect(DesktopMemoryRuntimeClient.clearLocalMemory('user-1')).resolves.toEqual({ deleted: 3 });
    await expect(DesktopMemoryRuntimeClient.clearChatHistory('user-1')).resolves.toEqual({ deleted: 4 });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, INVOKE_CHANNELS.CLEAR_LOCAL_MEMORY, {
      userId: 'user-1',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, INVOKE_CHANNELS.CLEAR_CHAT_HISTORY, {
      userId: 'user-1',
    });
  });
});
