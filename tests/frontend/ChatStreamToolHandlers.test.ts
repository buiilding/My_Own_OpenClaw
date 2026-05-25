import { act, renderHook } from '@testing-library/react';

import { useChatStreamToolHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers';

const mockRecordToolMessage = jest.fn();
const mockRecordAssistantMessage = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient', () => ({
  DesktopTranscriptProjectionRuntimeClient: {
    recordToolMessage: (...args: unknown[]) => mockRecordToolMessage(...args),
    recordAssistantMessage: (...args: unknown[]) => mockRecordAssistantMessage(...args),
  },
}));

function renderToolHandlers(modelId = 'model-1', modelProvider = 'provider-1') {
  return renderHook(() => useChatStreamToolHandlers({
    enableTranscript: true,
    modelContextRef: {
      current: {
        modelId,
        modelProvider,
      },
    },
  }));
}

describe('useChatStreamToolHandlers', () => {
  beforeEach(() => {
    mockRecordToolMessage.mockReset();
    mockRecordAssistantMessage.mockReset();
  });

  test('handles malformed tool-output payloads without crashing and persists a fallback transcript row', () => {
    const { result } = renderToolHandlers();

    expect(() => {
      act(() => {
        result.current.handleToolOutput({
          eventId: ' event-tool-output ',
          type: 'tool_output',
          conversationRef: 'conversation-1',
          turnRef: 'turn-1',
          revisionId: 'rev-1',
          timestamp: '2026-05-24T00:00:00.000Z',
          source: 'backend',
          payload: 'invalid payload',
        } as any, 'conversation-1');
      });
    }).not.toThrow();

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      'No output',
      expect.objectContaining({
        messageType: 'tool-output',
        correlationId: 'event-tool-output',
        conversationRef: 'conversation-1',
        structuredPayload: null,
      }),
    );
    expect(mockRecordAssistantMessage).not.toHaveBeenCalled();
  });

  test('prefers remote screenshot references for tool-output transcript rows', () => {
    const { result } = renderToolHandlers('model-2', 'provider-2');

    act(() => {
      result.current.handleToolOutput({
        eventId: 'event-tool-output-2',
        type: 'tool_output',
        conversationRef: 'conversation-2',
        turnRef: 'turn-2',
        revisionId: 'rev-2',
        timestamp: '2026-05-24T00:00:00.000Z',
        source: 'backend',
        payload: {
          toolName: 'mouse_control',
          requestId: 'request-2',
          userId: 'user-2',
          screenshot: 'inline-shot',
          screenshotRef: 'artifact-shot-2',
          structuredPayload: {
            tool_name: 'mouse_control',
            success: true,
            output: 'clicked',
            request_id: 'request-2',
            screenshot: 'inline-shot',
            screenshot_ref: 'artifact-shot-2',
          },
        },
      } as any, 'conversation-2');
    });

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      'clicked',
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'mouse_control',
        correlationId: 'request-2',
        conversationRef: 'conversation-2',
        userId: 'user-2',
        screenshotRef: 'artifact-shot-2',
        modelId: 'model-2',
        modelProvider: 'provider-2',
        structuredPayload: {
          kind: 'tool-output',
          toolCallDetails: expect.objectContaining({
            tool_name: 'mouse_control',
            request_id: 'request-2',
          }),
        },
      }),
    );
  });

  test('omits blank screenshot refs from tool-output transcript rows', () => {
    const { result } = renderToolHandlers('model-2b', 'provider-2b');

    act(() => {
      result.current.handleToolOutput({
        eventId: 'event-tool-output-2b',
        type: 'tool_output',
        conversationRef: 'conversation-2b',
        turnRef: 'turn-2b',
        revisionId: 'rev-2b',
        timestamp: '2026-05-24T00:00:00.000Z',
        source: 'backend',
        payload: {
          toolName: 'mouse_control',
          requestId: 'request-2b',
          userId: 'user-2b',
          screenshot: 'inline-shot-2b',
          screenshotRef: '   ',
          structuredPayload: {
            tool_name: 'mouse_control',
            success: true,
            output: 'clicked-inline',
            request_id: 'request-2b',
            screenshot: 'inline-shot-2b',
            screenshot_ref: '   ',
            screenshot_url: '   ',
          },
        },
      } as any, 'conversation-2b');
    });

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      'clicked-inline',
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'mouse_control',
        correlationId: 'request-2b',
        conversationRef: 'conversation-2b',
        userId: 'user-2b',
        screenshotRef: undefined,
        modelId: 'model-2b',
        modelProvider: 'provider-2b',
      }),
    );
  });

  test('handles malformed tool-bundle tools payload with stable empty bundle transcript formatting', () => {
    const { result } = renderToolHandlers('model-3', 'provider-3');

    expect(() => {
      act(() => {
        result.current.handleToolBundle({
          eventId: 'event-tool-bundle-1',
          type: 'tool_bundle_call',
          conversationRef: 'conversation-bundle-1',
          turnRef: 'turn-bundle-1',
          revisionId: 'rev-bundle-1',
          timestamp: '2026-05-24T00:00:00.000Z',
          source: 'backend',
          payload: {
            bundleId: 'bundle-1',
            correlationId: 'bundle-1',
            userId: 'user-bundle-1',
            tools: [],
            structuredPayload: {
              bundle_id: 'bundle-1',
              tools: null,
            },
          },
        } as any, 'conversation-bundle-1');
      });
    }).not.toThrow();

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      JSON.stringify({ bundle_id: 'bundle-1', tools: [] }, null, 2),
      expect.objectContaining({
        messageType: 'tool-bundle',
        toolName: 'tool-bundle',
        correlationId: 'bundle-1',
        conversationRef: 'conversation-bundle-1',
        userId: 'user-bundle-1',
        modelId: 'model-3',
        modelProvider: 'provider-3',
        structuredPayload: {
          kind: 'tool-bundle',
          toolCalls: [],
          toolCallDetails: {
            bundle_id: 'bundle-1',
            tools: null,
          },
        },
      }),
    );
  });

  test('persists backend-owned tool calls that skip frontend execution without owning active UI state', () => {
    const { result } = renderToolHandlers('model-web-search', 'gemini');

    act(() => {
      result.current.handleToolCall({
        eventId: 'event-tool-call-web-search',
        type: 'tool_call',
        conversationRef: 'conversation-web-search-1',
        turnRef: 'turn-web-search-1',
        revisionId: 'rev-web-search-1',
        timestamp: '2026-05-24T00:00:00.000Z',
        source: 'backend',
        payload: {
          toolName: 'web_search',
          requestId: 'request-web-search-1',
          userId: 'user-web-search-1',
          args: {
            query: 'Rachel Green',
          },
          structuredPayload: {
            tool_name: 'web_search',
            request_id: 'request-web-search-1',
            parameters: {
              query: 'Rachel Green',
            },
            metadata: {
              skip_frontend_execution: true,
              model_facing_tool_call: {
                id: 'tool_llm_web_search_1',
                name: 'web_search',
                arguments: {
                  query: 'Rachel Green',
                },
              },
            },
          },
        },
      } as any, 'conversation-web-search-1');
    });

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        messageType: 'tool-call',
        toolName: 'web_search',
        correlationId: 'request-web-search-1',
        conversationRef: 'conversation-web-search-1',
        userId: 'user-web-search-1',
        structuredPayload: expect.objectContaining({
          kind: 'tool-call',
          toolCallDetails: expect.objectContaining({
            tool_name: 'web_search',
            request_id: 'request-web-search-1',
          }),
        }),
      }),
    );
  });
});
