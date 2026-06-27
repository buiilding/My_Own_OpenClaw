/**
 * Covers manual compaction runtime. behavior in the frontend test suite.
 */

import { DesktopRendererConfigRuntimeClient } from '../../src/renderer/app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopConversationContinuityService } from '../../src/renderer/app/runtime/desktopConversationContinuityService';
import { DesktopSettingsRuntimeClient } from '../../src/renderer/app/runtime/desktopSettingsRuntimeClient';
import {
  DesktopChatStreamThinkingRuntime,
} from '../../src/renderer/app/runtime/desktopChatStreamThinkingRuntime';

const {
  getCompactionFailedThinkingStatus,
  getCompactionStartedThinkingStatus,
} = DesktopChatStreamThinkingRuntime;
import { DesktopManualCompactionRuntime } from '../../src/renderer/app/runtime/desktopManualCompactionRuntime';

const {
  runManualCompaction,
} = DesktopManualCompactionRuntime;

jest.mock('../../src/renderer/app/runtime/desktopRendererConfigRuntimeClient', () => ({
  DesktopRendererConfigRuntimeClient: {
    buildDeferredQueryModelSelection: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    compactHistory: jest.fn(),
  },
}));

describe('runManualCompaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection.mockReturnValue(null);
    DesktopConversationContinuityService.compactHistory.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sets failed thinking status when model sync setup throws', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection
      .mockReturnValue({ provider: 'openai', model: 'gpt-5.4' });
    DesktopSettingsRuntimeClient.setModel.mockImplementation(() => {
      throw new Error('model sync failed');
    });

    await runManualCompaction({
      config: {},
      conversationRef: 'conversation-1',
      userId: 'user-1',
      setThinkingStatus,
      setThinkingSourceEventType,
      warningContext: 'test',
    });

    expect(DesktopConversationContinuityService.compactHistory).not.toHaveBeenCalled();
    expect(setThinkingStatus).toHaveBeenNthCalledWith(1, getCompactionStartedThinkingStatus());
    expect(setThinkingStatus).toHaveBeenLastCalledWith(getCompactionFailedThinkingStatus());
    expect(setThinkingSourceEventType).toHaveBeenLastCalledWith('context-compaction-failed');
  });

  test('sets failed thinking status when compact dispatch rejects', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    DesktopConversationContinuityService.compactHistory.mockRejectedValue(
      new Error('dispatch failed'),
    );

    await runManualCompaction({
      config: {},
      conversationRef: 'conversation-1',
      userId: 'user-1',
      setThinkingStatus,
      setThinkingSourceEventType,
      warningContext: 'test',
    });

    expect(DesktopConversationContinuityService.compactHistory).toHaveBeenCalledWith(
      true,
      'conversation-1',
    );
    expect(setThinkingStatus).toHaveBeenNthCalledWith(1, getCompactionStartedThinkingStatus());
    expect(setThinkingStatus).toHaveBeenLastCalledWith(getCompactionFailedThinkingStatus());
    expect(setThinkingSourceEventType).toHaveBeenLastCalledWith('context-compaction-failed');
  });

  test('waits for selected model sync before compacting history', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    let resolveModelSync;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback();
      return 1;
    });
    DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection
      .mockReturnValue({ modelProvider: 'scripted', modelId: 'scripted-runtime' });
    DesktopSettingsRuntimeClient.setModel.mockImplementation(() => new Promise((resolve) => {
      resolveModelSync = resolve;
    }));

    const compactPromise = runManualCompaction({
      config: {},
      conversationRef: 'conversation-1',
      setThinkingStatus,
      setThinkingSourceEventType,
      warningContext: 'test',
    });
    await Promise.resolve();

    expect(DesktopSettingsRuntimeClient.setModel).toHaveBeenCalledWith({
      modelProvider: 'scripted',
      modelId: 'scripted-runtime',
    });
    expect(DesktopConversationContinuityService.compactHistory).not.toHaveBeenCalled();

    resolveModelSync();
    await compactPromise;

    expect(DesktopConversationContinuityService.compactHistory).toHaveBeenCalledWith(
      true,
      'conversation-1',
    );
  });
});
