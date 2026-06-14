/**
 * Covers transcript pending messages. behavior in the frontend test suite.
 */

import { createPendingTranscriptMessages } from '../../frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages';
import type { SessionInfo, TranscriptEntry } from '../../frontend/src/renderer/infrastructure/transcript/types';

const readySession: SessionInfo = {
  conversationRef: 'conversation-1',
  userId: 'user-1',
};

describe('pendingTranscriptMessages', () => {
  test('flushes queued entries in user -> assistant -> tool order', async () => {
    const storedEntries: TranscriptEntry[] = [];
    const manager = createPendingTranscriptMessages({
      storeTranscriptEntry: async (entry: TranscriptEntry) => {
        storedEntries.push(entry);
      },
      warn: jest.fn(),
    });

    manager.queueToolMessageForRetry('tool output', {
      messageType: 'tool-output',
      toolName: 'screenshot',
      structuredPayload: {
        kind: 'tool-output',
        toolCallDetails: {
          request_id: 'tool-1',
          output: 'tool output',
        },
      },
    });
    manager.queueAssistantMessageForRetry('assistant text', { messageType: 'llm-text' });
    manager.queueUserMessageForRetry('user text');

    await manager.flushPendingMessages(readySession);

    expect(storedEntries.map((entry) => entry.role)).toEqual(['user', 'assistant', 'tool']);
    expect(storedEntries[2]).toEqual(expect.objectContaining({
      content: 'tool output',
      structuredPayload: {
        kind: 'tool-output',
        toolCallDetails: {
          request_id: 'tool-1',
          output: 'tool output',
        },
      },
    }));
    expect(manager.hasPendingEntries()).toBe(false);
  });

  test('requeues failed category tail and retries on next flush', async () => {
    let failAssistantOnce = true;
    const stored: string[] = [];
    const warn = jest.fn();
    const manager = createPendingTranscriptMessages({
      storeTranscriptEntry: async (entry: TranscriptEntry) => {
        if (entry.role === 'assistant' && failAssistantOnce) {
          failAssistantOnce = false;
          throw new Error('assistant write failed');
        }
        stored.push(`${entry.role}:${entry.content}`);
      },
      warn,
    });

    manager.queueUserMessageForRetry('u1');
    manager.queueAssistantMessageForRetry('a1', { messageType: 'llm-text' });
    manager.queueAssistantMessageForRetry('a2', { messageType: 'llm-text' });
    manager.queueToolMessageForRetry('t1', { messageType: 'tool-output' });

    await manager.flushPendingMessages(readySession);

    expect(stored).toEqual(['user:u1']);
    expect(manager.hasPendingEntries()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);

    await manager.flushPendingMessages(readySession);

    expect(stored).toEqual(['user:u1', 'assistant:a1', 'assistant:a2', 'tool:t1']);
    expect(manager.hasPendingEntries()).toBe(false);
  });

  test('requeues failed older messages ahead of messages enqueued during an in-flight flush', async () => {
    let rejectSecondWrite: (error: Error) => void = () => undefined;
    let secondWriteStarted: () => void = () => undefined;
    const secondWriteStartedPromise = new Promise<void>((resolve) => {
      secondWriteStarted = resolve;
    });
    const stored: string[] = [];
    let failSecondWriteOnce = true;
    const manager = createPendingTranscriptMessages({
      storeTranscriptEntry: async (entry: TranscriptEntry) => {
        if (entry.content === 'u2' && failSecondWriteOnce) {
          secondWriteStarted();
          try {
            await new Promise((_resolve, reject) => {
              rejectSecondWrite = reject;
            });
          } finally {
            failSecondWriteOnce = false;
          }
        }
        stored.push(String(entry.content));
      },
      warn: jest.fn(),
    });

    manager.queueUserMessageForRetry('u1');
    manager.queueUserMessageForRetry('u2');

    const firstFlush = manager.flushPendingMessages(readySession);
    await secondWriteStartedPromise;
    manager.queueUserMessageForRetry('u3');
    rejectSecondWrite(new Error('u2 write failed'));
    await firstFlush;

    expect(stored).toEqual(['u1']);

    await manager.flushPendingMessages(readySession);

    expect(stored).toEqual(['u1', 'u2', 'u3']);
  });

  test('preserves assistant retry structured payload through flush', async () => {
    const storedEntries: TranscriptEntry[] = [];
    const manager = createPendingTranscriptMessages({
      storeTranscriptEntry: async (entry: TranscriptEntry) => {
        storedEntries.push(entry);
      },
      warn: jest.fn(),
    });
    const structuredPayload = {
      kind: 'tool-call' as const,
      toolCall: {
        name: 'read_file',
        arguments: { file_path: '/tmp/example.txt' },
      },
      toolCallDetails: {
        request_id: 'request-1',
      },
    };

    manager.queueAssistantMessageForRetry('assistant tool call', {
      messageType: 'tool-call',
      structuredPayload,
    });

    await manager.flushPendingMessages(readySession);

    expect(storedEntries).toHaveLength(1);
    expect(storedEntries[0]).toEqual(expect.objectContaining({
      role: 'assistant',
      messageType: 'tool-call',
      structuredPayload,
    }));
  });
});
