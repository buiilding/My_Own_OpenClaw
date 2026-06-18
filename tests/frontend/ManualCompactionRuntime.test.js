/**
 * Covers manual compaction runtime. behavior in the frontend test suite.
 */

import { buildDeferredQueryModelSelection } from '../../frontend/src/renderer/app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopConversationContinuityService } from '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService';
import { DesktopSettingsRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient';
import {
  COMPACTION_FAILED_THINKING_STATUS,
  COMPACTION_THINKING_STATUS,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamThinkingStatus';
import { runManualCompaction } from '../../frontend/src/renderer/features/chat/utils/session/manualCompactionRuntime';

jest.mock('../../frontend/src/renderer/app/runtime/desktopRendererConfigRuntimeClient', () => ({
  buildDeferredQueryModelSelection: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    compactHistory: jest.fn(),
  },
}));

describe('runManualCompaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    buildDeferredQueryModelSelection.mockReturnValue(null);
    DesktopConversationContinuityService.compactHistory.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sets failed thinking status when model sync setup throws', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    buildDeferredQueryModelSelection.mockReturnValue({ provider: 'openai', model: 'gpt-5.4' });
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
    expect(setThinkingStatus).toHaveBeenNthCalledWith(1, COMPACTION_THINKING_STATUS);
    expect(setThinkingStatus).toHaveBeenLastCalledWith(COMPACTION_FAILED_THINKING_STATUS);
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
    expect(setThinkingStatus).toHaveBeenNthCalledWith(1, COMPACTION_THINKING_STATUS);
    expect(setThinkingStatus).toHaveBeenLastCalledWith(COMPACTION_FAILED_THINKING_STATUS);
    expect(setThinkingSourceEventType).toHaveBeenLastCalledWith('context-compaction-failed');
  });
});
