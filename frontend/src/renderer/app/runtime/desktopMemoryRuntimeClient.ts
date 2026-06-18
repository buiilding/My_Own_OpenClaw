/**
 * Coordinates the desktop memory runtime client for the renderer UI.
 */

import { invokeAgentSdkCommand } from './agentSdkCommandInvokeClient';
import { SDK_RUNTIME_COMMANDS } from '../../infrastructure/api/agentSdkClient';
import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../infrastructure/ipc/channels';

type MemoryKind = 'episodic' | 'semantic';

type MemoryListData = {
  memories?: unknown[];
};

export type MemoryStoreChangedListener = (payload?: unknown) => void;

async function listMemories(type: MemoryKind, limit: number): Promise<unknown[]> {
  const data = await invokeAgentSdkCommand<MemoryListData>(SDK_RUNTIME_COMMANDS.MEMORIES_LIST, {
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
    const data = await invokeAgentSdkCommand<{ deleted?: boolean }>(SDK_RUNTIME_COMMANDS.MEMORIES_DELETE, {
      type: input.kind,
      memoryId: input.memoryId,
    });
    if (data?.deleted === false) {
      throw new Error(`${input.kind} memory was not deleted`);
    }
  },

  async clearLocalMemory(): Promise<unknown> {
    return invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.MEMORIES_CLEAR_ALL, {});
  },

  async clearChatHistory(userId: string): Promise<unknown> {
    return invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_CLEAR_ALL, { userId });
  },

  onMemoryStoreChanged(listener: MemoryStoreChangedListener): (() => void) | undefined {
    return IpcBridge.on(DESKTOP_RUNTIME_ON_CHANNELS.MEMORY_STORE_CHANGED, listener);
  },
};
