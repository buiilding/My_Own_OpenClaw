import { act, renderHook } from '@testing-library/react';

import { useChatStreamToolHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers';

const mockRecordToolMessage = jest.fn();
const mockRecordAssistantMessage = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  recordToolMessage: (...args: unknown[]) => mockRecordToolMessage(...args),
  recordAssistantMessage: (...args: unknown[]) => mockRecordAssistantMessage(...args),
}));

describe('useChatStreamToolHandlers', () => {
  beforeEach(() => {
    mockRecordToolMessage.mockReset();
    mockRecordAssistantMessage.mockReset();
  });

  test('handles malformed tool-output payloads without crashing and falls back correlation id to event id', () => {
    const addMessage = jest.fn();
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamToolHandlers({
      enableTranscript: true,
      addMessage,
      setIsSending,
      setThinkingStatus,
      setThinkingSourceEventType,
      modelContextRef: {
        current: {
          modelId: 'model-1',
          modelProvider: 'provider-1',
        },
      },
      recordTrackingEvent,
    }));

    expect(() => {
      act(() => {
        result.current.handleToolOutput({
          id: ' event-tool-output ',
          type: 'tool-output',
          turn_ref: 'turn-1',
          conversation_ref: 'conversation-1',
          user_id: 'user-1',
          payload: 'invalid payload',
        } as any, 'conversation-1');
      });
    }).not.toThrow();

    expect(setIsSending).toHaveBeenCalledWith(false, 'conversation-1');
    expect(setThinkingStatus).toHaveBeenCalledWith(null, 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith(null, 'conversation-1');

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-output',
        text: 'No output',
        toolOutputDetails: null,
        correlationId: 'event-tool-output',
        screenshot: null,
        screenshotRef: null,
        screenshotUrl: null,
      }),
      'conversation-1',
    );

    expect(recordTrackingEvent).toHaveBeenCalledWith(
      'tool-output',
      'turn-1',
      { toolOutput: true },
      'conversation-1',
    );

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      'No output',
      expect.objectContaining({
        messageType: 'tool-output',
        correlationId: 'event-tool-output',
        conversationRef: 'conversation-1',
      }),
    );
  });

  test('prefers remote screenshot references over inline screenshot payload for tool-output rows', () => {
    const addMessage = jest.fn();

    const { result } = renderHook(() => useChatStreamToolHandlers({
      enableTranscript: true,
      addMessage,
      setIsSending: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      modelContextRef: {
        current: {
          modelId: 'model-2',
          modelProvider: 'provider-2',
        },
      },
      recordTrackingEvent: jest.fn(),
    }));

    act(() => {
      result.current.handleToolOutput({
        id: 'event-tool-output-2',
        type: 'tool-output',
        turn_ref: 'turn-2',
        conversation_ref: 'conversation-2',
        user_id: 'user-2',
        payload: {
          tool_name: 'mouse_control',
          success: true,
          output: 'clicked',
          request_id: 'request-2',
          screenshot: 'inline-shot',
          screenshot_ref: 'artifact-shot-2',
        },
      } as any, 'conversation-2');
    });

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-output',
        text: 'clicked',
        toolName: 'mouse_control',
        correlationId: 'request-2',
        screenshot: null,
        screenshotRef: 'artifact-shot-2',
        screenshotUrl: expect.stringContaining('/api/artifacts/artifact-shot-2'),
      }),
      'conversation-2',
    );

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      'clicked',
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'mouse_control',
        correlationId: 'request-2',
        screenshotRef: 'artifact-shot-2',
      }),
    );
  });

  test('keeps inline screenshot when tool-output screenshot_ref and screenshot_url are whitespace', () => {
    const addMessage = jest.fn();

    const { result } = renderHook(() => useChatStreamToolHandlers({
      enableTranscript: true,
      addMessage,
      setIsSending: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      modelContextRef: {
        current: {
          modelId: 'model-2b',
          modelProvider: 'provider-2b',
        },
      },
      recordTrackingEvent: jest.fn(),
    }));

    act(() => {
      result.current.handleToolOutput({
        id: 'event-tool-output-2b',
        type: 'tool-output',
        turn_ref: 'turn-2b',
        conversation_ref: 'conversation-2b',
        user_id: 'user-2b',
        payload: {
          tool_name: 'mouse_control',
          success: true,
          output: 'clicked-inline',
          request_id: 'request-2b',
          screenshot: 'inline-shot-2b',
          screenshot_ref: '   ',
          screenshot_url: '   ',
        },
      } as any, 'conversation-2b');
    });

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-output',
        text: 'clicked-inline',
        toolName: 'mouse_control',
        correlationId: 'request-2b',
        screenshot: 'inline-shot-2b',
        screenshotRef: null,
        screenshotUrl: null,
      }),
      'conversation-2b',
    );

    expect(mockRecordToolMessage).toHaveBeenCalledWith(
      'clicked-inline',
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'mouse_control',
        correlationId: 'request-2b',
        screenshotRef: null,
      }),
    );
  });

  test('handles malformed tool-bundle tools payload with stable empty bundle formatting and no transcript tool-call row', () => {
    const addMessage = jest.fn();
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamToolHandlers({
      enableTranscript: true,
      addMessage,
      setIsSending: jest.fn(),
      setThinkingStatus,
      setThinkingSourceEventType,
      modelContextRef: {
        current: {
          modelId: 'model-3',
          modelProvider: 'provider-3',
        },
      },
      recordTrackingEvent,
    }));

    expect(() => {
      act(() => {
        result.current.handleToolBundle({
          id: 'event-tool-bundle-1',
          type: 'tool-bundle',
          turn_ref: 'turn-bundle-1',
          conversation_ref: 'conversation-bundle-1',
          payload: {
            bundle_id: 'bundle-1',
            tools: null,
          },
        } as any, 'conversation-bundle-1');
      });
    }).not.toThrow();

    expect(setThinkingStatus).toHaveBeenCalledWith(null, 'conversation-bundle-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith(null, 'conversation-bundle-1');
    expect(recordTrackingEvent).toHaveBeenCalledWith(
      'tool-bundle',
      'turn-bundle-1',
      { phase: 'tool-call', toolCall: true },
      'conversation-bundle-1',
    );

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-call',
        sourceEventType: 'tool-bundle',
        text: JSON.stringify({ bundle_id: 'bundle-1', tools: [] }, null, 2),
        toolCallDisplayText: JSON.stringify({ bundle_id: 'bundle-1', tools: [] }, null, 2),
      }),
      'conversation-bundle-1',
    );

    // Bundle orchestration events must not be persisted as executable tool-call transcript rows.
    expect(mockRecordToolMessage).not.toHaveBeenCalled();
  });

  test('records lightweight search-source rows as assistant transcript entries', () => {
    const addMessage = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamToolHandlers({
      enableTranscript: true,
      addMessage,
      setIsSending: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      modelContextRef: {
        current: {
          modelId: 'model-search',
          modelProvider: 'openai',
        },
      },
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleSearchSource({
        type: 'search-source',
        turn_ref: 'turn-search-1',
        conversation_ref: 'conversation-search-1',
        user_id: 'user-search-1',
        payload: {
          url: 'https://example.com/source',
          provider: 'openai',
        },
      } as any, 'conversation-search-1');
    });

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'search-source',
        text: 'Searching https://example.com/source',
      }),
      'conversation-search-1',
    );
    expect(recordTrackingEvent).toHaveBeenCalledWith(
      'search-source',
      'turn-search-1',
      { phase: 'tool-output' },
      'conversation-search-1',
    );
    expect(mockRecordAssistantMessage).toHaveBeenCalledWith(
      'Searching https://example.com/source',
      expect.objectContaining({
        messageType: 'search-source',
        conversationRef: 'conversation-search-1',
      }),
    );
  });
});
