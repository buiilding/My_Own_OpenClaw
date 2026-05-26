import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

type MemoryKind = 'episodic' | 'semantic';

type IpcResult<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
};

type MemoryListData = {
  memories?: unknown[];
};

function assertIpcSuccess<T>(result: IpcResult<T> | null | undefined, fallbackMessage: string): T {
  if (!result || result.success === false) {
    throw new Error(result?.error || fallbackMessage);
  }
  return result.data as T;
}

async function listMemories(channel: typeof INVOKE_CHANNELS.LIST_EPISODIC_MEMORIES | typeof INVOKE_CHANNELS.LIST_SEMANTIC_MEMORIES, userId: string, limit: number): Promise<unknown[]> {
  const data = assertIpcSuccess<MemoryListData>(
    await IpcBridge.invoke(channel, { userId, limit }),
    channel === INVOKE_CHANNELS.LIST_EPISODIC_MEMORIES
      ? 'Failed to load episodic memories'
      : 'Failed to load semantic memories',
  );
  return Array.isArray(data?.memories) ? data.memories : [];
}

export const DesktopMemoryRuntimeClient = {
  async listEpisodicMemories(userId: string, limit = 200): Promise<unknown[]> {
    return listMemories(INVOKE_CHANNELS.LIST_EPISODIC_MEMORIES, userId, limit);
  },

  async listSemanticMemories(userId: string, limit = 200): Promise<unknown[]> {
    return listMemories(INVOKE_CHANNELS.LIST_SEMANTIC_MEMORIES, userId, limit);
  },

  async deleteMemoryItem(input: {
    userId: string;
    memoryId: string;
    kind: MemoryKind;
  }): Promise<void> {
    const channel = input.kind === 'semantic'
      ? INVOKE_CHANNELS.DELETE_SEMANTIC_MEMORY
      : INVOKE_CHANNELS.DELETE_EPISODIC_MEMORY;
    const data = assertIpcSuccess<{ deleted?: boolean }>(
      await IpcBridge.invoke(channel, {
        userId: input.userId,
        memoryId: input.memoryId,
      }),
      `Failed to delete ${input.kind} memory`,
    );
    if (data?.deleted === false) {
      throw new Error(`${input.kind} memory was not deleted`);
    }
  },

  async clearLocalMemory(userId: string): Promise<unknown> {
    return assertIpcSuccess(
      await IpcBridge.invoke(INVOKE_CHANNELS.CLEAR_LOCAL_MEMORY, { userId }),
      'Failed to clear local memory',
    );
  },

  async clearChatHistory(userId: string): Promise<unknown> {
    return assertIpcSuccess(
      await IpcBridge.invoke(INVOKE_CHANNELS.CLEAR_CHAT_HISTORY, { userId }),
      'Failed to clear chat history',
    );
  },
};
