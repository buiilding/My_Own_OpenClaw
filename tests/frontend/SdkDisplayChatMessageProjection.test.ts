/**
 * Covers sdk display chat message projection. behavior in the frontend test suite.
 */

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

  test('projects multi-image user screenshot refs into renderer screenshot attachments', () => {
    const display: DisplayConversation = {
      conversationRef: 'conv-multi-shot',
      revisionId: 'rev-1',
      compaction: { status: 'idle' },
      messages: [
        {
          id: 'msg-user-multi-shot',
          conversationRef: 'conv-multi-shot',
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          sender: 'user',
          text: 'look at both',
          messageType: 'user_message',
          metadata: {
            screenshot_refs: ['artifact-user-1', 'artifact-user-2'],
          },
        },
      ],
    };

    expect(buildChatMessagesFromDisplayConversation(display)).toEqual([
      expect.objectContaining({
        id: 'msg-user-multi-shot',
        sender: 'user',
        screenshots: [
          {
            screenshotRef: 'artifact-user-1',
            screenshotUrl: expect.stringContaining('/api/artifacts/artifact-user-1'),
          },
          {
            screenshotRef: 'artifact-user-2',
            screenshotUrl: expect.stringContaining('/api/artifacts/artifact-user-2'),
          },
        ],
      }),
    ]);
  });

  test('projects live SDK row raw screenshot refs into renderer screenshot attachments', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'row-user-multi-shot',
        conversationRef: 'conv-multi-shot',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look at both',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          raw: {
            text: 'look at both',
            screenshot_refs: ['artifact-user-1', 'artifact-user-2'],
          },
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'row-user-multi-shot',
        sender: 'user',
        text: 'look at both',
        screenshots: [
          {
            screenshotRef: 'artifact-user-1',
            screenshotUrl: expect.stringContaining('/api/artifacts/artifact-user-1'),
          },
          {
            screenshotRef: 'artifact-user-2',
            screenshotUrl: expect.stringContaining('/api/artifacts/artifact-user-2'),
          },
        ],
      }),
    ]);
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

  test('projects SDK tool progress rows into retained search-source messages', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'progress-1',
        conversationRef: 'conv-search',
        turnRef: 'turn-search',
        index: 0,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Searched example.com',
        metadata: {
          revisionId: 'rev-search',
          timestamp: '2026-06-09T04:20:00.000Z',
          toolName: 'web_search',
          requestId: 'req-search-1',
          correlationId: 'corr-search-1',
          raw: {
            text: 'Searched example.com',
            rawEvent: {
              type: 'web-search-progress',
            },
          },
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'progress-1',
        sender: 'assistant',
        type: 'search-source',
        text: 'Searched example.com',
        sourceEventType: 'web-search-progress',
        sourceChannel: 'windie:rows',
        turnRef: 'turn-search',
        toolName: 'web_search',
        correlationId: 'req-search-1',
        timestamp: '2026-06-09T04:20:00.000Z',
      }),
    ]);
  });
});
