import {
  buildChatMessagesFromDisplayConversation,
  buildChatMessagesFromSdkDisplayRows,
} from '../../frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection';
import type { DisplayConversation } from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

describe('sdkDisplayChatMessageProjection', () => {
  test('projects SDK display messages into existing chat message shapes', () => {
    const display: DisplayConversation = {
      conversationRef: 'conv-sdk',
      revisionId: 'rev-1',
      compaction: { status: 'idle' },
      messages: [
        {
          id: 'msg-user',
          conversationRef: 'conv-sdk',
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          sender: 'user',
          text: 'open package json',
          messageType: 'user_message',
        },
        {
          id: 'msg-tool-call',
          conversationRef: 'conv-sdk',
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:01.000Z',
          sender: 'tool',
          text: 'read_file',
          messageType: 'tool_call',
          toolName: 'read_file',
          requestId: 'req-1',
          toolCallId: 'call-1',
          metadata: {
            args: { path: 'package.json' },
            structuredPayload: {
              tool_calls: [{
                id: 'call-1',
                name: 'read_file',
                arguments: { path: 'package.json' },
              }],
            },
          },
        },
        {
          id: 'msg-tool-output',
          conversationRef: 'conv-sdk',
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:02.000Z',
          sender: 'tool',
          text: 'package contents',
          messageType: 'tool_output',
          toolName: 'read_file',
          requestId: 'req-1',
          toolCallId: 'call-1',
          metadata: {
            success: true,
          },
        },
        {
          id: 'msg-assistant',
          conversationRef: 'conv-sdk',
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:03.000Z',
          sender: 'assistant',
          text: 'package json is loaded',
          messageType: 'assistant_message',
        },
      ],
    };

    expect(buildChatMessagesFromDisplayConversation(display)).toEqual([
      expect.objectContaining({
        id: 'msg-user',
        sender: 'user',
        text: 'open package json',
        timestamp: '2026-05-15T12:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'msg-tool-call',
        sender: 'assistant',
        type: 'tool-call',
        correlationId: 'req-1',
        modelFacingToolCall: expect.objectContaining({
          id: 'call-1',
          name: 'read_file',
        }),
      }),
      expect.objectContaining({
        id: 'msg-tool-output',
        sender: 'assistant',
        type: 'tool-output',
        correlationId: 'req-1',
        success: true,
      }),
      expect.objectContaining({
        id: 'msg-assistant',
        sender: 'assistant',
        type: 'llm-text',
        text: 'package json is loaded',
      }),
    ]);
  });

  test('normalizes persisted screenshot artifact refs without treating them as inline image bytes', () => {
    const display: DisplayConversation = {
      conversationRef: 'conv-shot',
      revisionId: 'rev-1',
      compaction: { status: 'idle' },
      messages: [
        {
          id: 'msg-user-shot',
          conversationRef: 'conv-shot',
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          sender: 'user',
          text: 'look here',
          messageType: 'user_message',
          metadata: {
            screenshotRef: 'artifact-user-1',
            screenshot: 'artifact-user-1',
          },
        },
      ],
    };

    expect(buildChatMessagesFromDisplayConversation(display)).toEqual([
      expect.objectContaining({
        id: 'msg-user-shot',
        sender: 'user',
        screenshotRef: 'artifact-user-1',
        screenshotUrl: expect.stringContaining('/api/artifacts/artifact-user-1'),
      }),
    ]);
    expect(buildChatMessagesFromDisplayConversation(display)[0]).not.toHaveProperty('screenshot');
  });

  test('projects SDK streaming assistant rows with reasoning text', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'conv-1:turn-1:assistant',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Partial answer',
        isStreaming: true,
        metadata: {
          raw: {
            reasoningText: 'Thinking through it.',
          },
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:assistant',
        sender: 'assistant',
        type: 'llm-text',
        text: 'Partial answer',
        isComplete: false,
        thinkingText: 'Thinking through it.',
        thinkingSourceEventType: 'reasoning_delta',
        sourceEventType: 'assistant_delta',
      }),
    ]);
  });
});
