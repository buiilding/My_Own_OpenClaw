import { invokeWindieCommand } from './windieCommandInvokeClient';

type MemoryKind = 'episodic' | 'semantic';

type MemoryListData = {
  memories?: unknown[];
};

async function listMemories(type: MemoryKind, userId: string, limit: number): Promise<unknown[]> {
  const data = await invokeWindieCommand<MemoryListData>('memories.list', {
    userId,
    type,
    limit,
  });
  return Array.isArray(data?.memories) ? data.memories : [];
}

export const DesktopMemoryRuntimeClient = {
  async listEpisodicMemories(userId: string, limit = 200): Promise<unknown[]> {
    return listMemories('episodic', userId, limit);
  },

  async listSemanticMemories(userId: string, limit = 200): Promise<unknown[]> {
    return listMemories('semantic', userId, limit);
  },

  async deleteMemoryItem(input: {
    userId: string;
    memoryId: string;
    kind: MemoryKind;
  }): Promise<void> {
    const data = await invokeWindieCommand<{ deleted?: boolean }>('memories.delete', {
      userId: input.userId,
      type: input.kind,
      memoryId: input.memoryId,
    });
    if (data?.deleted === false) {
      throw new Error(`${input.kind} memory was not deleted`);
    }
  },

  async clearLocalMemory(userId: string): Promise<unknown> {
    return invokeWindieCommand('memories.clearAll', { userId });
  },

  async clearChatHistory(userId: string): Promise<unknown> {
    return invokeWindieCommand('conversations.clearAll', { userId });
  },
};
