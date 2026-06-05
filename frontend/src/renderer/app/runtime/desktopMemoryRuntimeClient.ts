import { invokeWindieCommand } from './windieCommandInvokeClient';

type MemoryKind = 'episodic' | 'semantic';

type MemoryListData = {
  memories?: unknown[];
};

async function listMemories(type: MemoryKind, limit: number): Promise<unknown[]> {
  const data = await invokeWindieCommand<MemoryListData>('memories.list', {
    type,
    limit,
  });
  return Array.isArray(data?.memories) ? data.memories : [];
}

export const DesktopMemoryRuntimeClient = {
  async listEpisodicMemories(limit = 200): Promise<unknown[]> {
    return listMemories('episodic', limit);
  },

  async listSemanticMemories(limit = 200): Promise<unknown[]> {
    return listMemories('semantic', limit);
  },

  async deleteMemoryItem(input: {
    memoryId: string;
    kind: MemoryKind;
  }): Promise<void> {
    const data = await invokeWindieCommand<{ deleted?: boolean }>('memories.delete', {
      type: input.kind,
      memoryId: input.memoryId,
    });
    if (data?.deleted === false) {
      throw new Error(`${input.kind} memory was not deleted`);
    }
  },

  async clearLocalMemory(): Promise<unknown> {
    return invokeWindieCommand('memories.clearAll', {});
  },

  async clearChatHistory(userId: string): Promise<unknown> {
    return invokeWindieCommand('conversations.clearAll', { userId });
  },
};
