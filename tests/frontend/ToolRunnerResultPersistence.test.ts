import type { MutableRefObject } from 'react';

import type {
  BundleExecutionResult,
  ToolExecutionResult,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionService';
import { recordToolMessage } from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import {
  persistToolRunnerBundleResult,
  persistToolRunnerSurfaceFailureResult,
  persistToolRunnerToolResult,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerResultPersistence';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  recordToolMessage: jest.fn(),
}));

describe('toolRunnerResultPersistence', () => {
  const addMessage = jest.fn();
  const shouldAcceptExecutionResult = jest.fn();
  const resolveExecutionConversationRef = jest.fn();
  const modelContextRef = {
    current: { modelId: 'gpt-5', modelProvider: 'openai' },
  } as MutableRefObject<{ modelId: string | null; modelProvider: string | null }>;

  beforeEach(() => {
    addMessage.mockReset();
    shouldAcceptExecutionResult.mockReset();
    resolveExecutionConversationRef.mockReset();
    (recordToolMessage as jest.Mock).mockReset();
  });

  test('skips tool persistence when correlation is rejected', () => {
    const result: ToolExecutionResult = {
      toolName: 'read_file',
      result: { success: true, data: { content: 'ok' }, error: null },
      executionTime: 0.1,
      correlationId: 'req-1',
      formattedMessage: 'done',
    };
    shouldAcceptExecutionResult.mockReturnValue(false);

    persistToolRunnerToolResult(result, {
      shouldAcceptExecutionResult,
      resolveExecutionConversationRef,
      addMessage,
      modelContextRef,
    });

    expect(addMessage).not.toHaveBeenCalled();
    expect(recordToolMessage).not.toHaveBeenCalled();
  });

  test('persists bundle result to message store and transcript', () => {
    const result: BundleExecutionResult = {
      correlationId: 'bundle-1',
      results: [{ tool_name: 'search', success: true, data: { ok: true } }],
      totalTime: 0.2,
      formattedMessage: 'bundle complete',
    };
    shouldAcceptExecutionResult.mockReturnValue(true);
    resolveExecutionConversationRef.mockReturnValue('conv-1');

    persistToolRunnerBundleResult(result, {
      shouldAcceptExecutionResult,
      resolveExecutionConversationRef,
      addMessage,
      modelContextRef,
    });

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage.mock.calls[0][1]).toBe('conv-1');
    expect(recordToolMessage).toHaveBeenCalledWith(
      'bundle complete',
      expect.objectContaining({
        toolName: 'bundled_tools',
        correlationId: 'bundle-1',
        conversationRef: 'conv-1',
        modelId: 'gpt-5',
        modelProvider: 'openai',
      }),
    );
  });

  test('persists surface failure result to message store and transcript', () => {
    persistToolRunnerSurfaceFailureResult(
      'read_file',
      'req-fail',
      'surface unavailable',
      {
        addMessage,
        conversationRef: 'conv-2',
        modelContextRef,
      },
    );

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage.mock.calls[0][1]).toBe('conv-2');
    expect(recordToolMessage).toHaveBeenCalledWith(
      expect.stringContaining('status: failed'),
      expect.objectContaining({
        toolName: 'read_file',
        correlationId: 'req-fail',
        conversationRef: 'conv-2',
        modelId: 'gpt-5',
        modelProvider: 'openai',
      }),
    );
  });
});
