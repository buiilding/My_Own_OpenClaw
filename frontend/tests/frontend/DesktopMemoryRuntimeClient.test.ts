/**
 * Covers memory app-runtime client behavior in the frontend test suite.
 */

import * as DesktopMemoryRuntimeModule from '../../src/renderer/app/runtime/desktopMemoryRuntimeClient';
import { DesktopMemoryRuntimeClient } from '../../src/renderer/app/runtime/desktopMemoryRuntimeClient';
import { AgentSdkCommandInvokeClient } from '../../src/renderer/app/runtime/agentSdkCommandInvokeClient';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';

jest.mock('../../src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  AgentSdkCommandInvokeClient: {
    invokeAgentSdkCommand: jest.fn(),
  },
}));

const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;
const mockInvokeAgentSdkCommand = invokeAgentSdkCommand as jest.MockedFunction<typeof invokeAgentSdkCommand>;

describe('DesktopMemoryRuntimeClient', () => {
  beforeEach(() => {
    mockInvokeAgentSdkCommand.mockReset();
  });

  test('lists episodic and semantic memories through SDK-shaped commands', async () => {
    mockInvokeAgentSdkCommand
      .mockResolvedValueOnce({ memories: [{ id: 'ep-1' }] })
      .mockResolvedValueOnce({ memories: [{ id: 'sem-1' }] });

    await expect(DesktopMemoryRuntimeClient.listEpisodicMemories(25)).resolves.toEqual([{ id: 'ep-1' }]);
    await expect(DesktopMemoryRuntimeClient.listSemanticMemories(10)).resolves.toEqual([{ id: 'sem-1' }]);

    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(1, 'memories.list', {
      type: 'episodic',
      limit: 25,
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(2, 'memories.list', {
      type: 'semantic',
      limit: 10,
    });
  });

  test('maps delete requests by memory kind and rejects failed deletes', async () => {
    mockInvokeAgentSdkCommand
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

    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(1, 'memories.delete', {
      type: 'semantic',
      memoryId: 'sem-1',
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(2, 'memories.delete', {
      type: 'episodic',
      memoryId: 'ep-1',
    });
  });

  test('clears memory and chat history through SDK-shaped commands', async () => {
    mockInvokeAgentSdkCommand
      .mockResolvedValueOnce({ deleted: 3 })
      .mockResolvedValueOnce({ deleted: 4 });

    await expect(DesktopMemoryRuntimeClient.clearLocalMemory()).resolves.toEqual({ deleted: 3 });
    await expect(DesktopMemoryRuntimeClient.clearChatHistory('user-1')).resolves.toEqual({ deleted: 4 });

    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(1, 'memories.clearAll', {});
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(2, 'conversations.clearAll', {
      userId: 'user-1',
    });
  });

  test('resolves actionable memory admin user ids from transcript session info', () => {
    expect(DesktopMemoryRuntimeModule).not.toHaveProperty('resolveMemoryAdminUserId');
    expect(DesktopMemoryRuntimeClient.resolveMemoryAdminUserId({ userId: ' user-1 ' })).toBe('user-1');
    expect(DesktopMemoryRuntimeClient.resolveMemoryAdminUserId({ userId: 'default_user' }))
      .toBeNull();
    expect(DesktopMemoryRuntimeClient.resolveMemoryAdminUserId({ userId: '' })).toBeNull();
    expect(DesktopMemoryRuntimeClient.resolveMemoryAdminUserId(null)).toBeNull();
  });

  test('subscribes to memory store changes through renderer app-runtime fan-out', () => {
    const removeListener = jest.fn();
    const listener = jest.fn();
    const onSpy = jest.spyOn(IpcBridge, 'on').mockReturnValue(removeListener);

    expect(DesktopMemoryRuntimeClient.onMemoryStoreChanged(listener)).toBe(removeListener);
    expect(onSpy).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.MEMORY_STORE_CHANGED,
      listener,
    );

    onSpy.mockRestore();
  });
});
