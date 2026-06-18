/**
 * Covers sdk display chat message projection. behavior in the frontend test suite.
 */

import {
  buildChatMessagesFromSdkDisplayRows,
} from '../../frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection';

describe('sdkDisplayChatMessageProjection', () => {
  test('projects SDK display messages into existing chat message shapes', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'open package json',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
        },
      },
      {
        id: 'msg-tool-call',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'tool_call',
        content: {
          id: 'call-1',
          name: 'read_file',
          arguments: { path: 'package.json' },
        },
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:01.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          toolCallId: 'call-1',
          modelFacingToolCall: {
            id: 'call-1',
            name: 'read_file',
            arguments: { path: 'package.json' },
          },
        },
      },
      {
        id: 'msg-tool-output',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'tool',
        type: 'tool_output',
        content: 'package contents',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:02.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          toolCallId: 'call-1',
          success: true,
        },
      },
      {
        id: 'msg-assistant',
        conversationRef: 'conv-sdk',
        index: 3,
        role: 'assistant',
        type: 'assistant_message',
        content: 'package json is loaded',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:03.000Z',
        },
      },
    ])).toEqual([
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

  test('normalizes persisted screenshot artifact refs without treating inline payloads as primary image bytes', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-shot',
        conversationRef: 'conv-shot',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look here',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          screenshotRef: 'artifact-user-1',
          screenshot: 'inline-shot',
        },
      },
    ]);

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'msg-user-shot',
        sender: 'user',
        screenshotRef: 'artifact-user-1',
        screenshotUrl: expect.stringContaining('/api/artifacts/artifact-user-1'),
      }),
    ]);
    expect(messages[0]).not.toHaveProperty('screenshot');
  });

  test('projects multi-image user screenshot refs into renderer screenshot attachments', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-multi-shot',
        conversationRef: 'conv-multi-shot',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look at both',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          screenshotRefs: ['artifact-user-1', 'artifact-user-2'],
        },
      },
    ])).toEqual([
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
          screenshotRefs: ['artifact-user-1', 'artifact-user-2'],
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
          reasoningText: 'Thinking through it.',
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
          rawEventType: 'web-search-progress',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'progress-1',
        sender: 'assistant',
        type: 'search-source',
        text: 'Searched example.com',
        sourceEventType: 'web-search-progress',
        sourceChannel: 'sdk:display-rows',
        turnRef: 'turn-search',
        toolName: 'web_search',
        correlationId: 'req-search-1',
        timestamp: '2026-06-09T04:20:00.000Z',
      }),
    ]);
  });
});
