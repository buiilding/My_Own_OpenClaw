/**
 * Covers chat stream tool handlers. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { useChatStreamToolHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers';

function renderToolHandlers() {
  return renderHook(() => useChatStreamToolHandlers());
}

describe('useChatStreamToolHandlers', () => {
  test('accepts SDK tool events without owning live transcript persistence', () => {
    const { result } = renderToolHandlers();

    expect(() => {
      act(() => {
        result.current.handleToolCall({
          eventId: 'event-tool-call',
          type: 'tool_call',
          conversationRef: 'conversation-1',
          turnRef: 'turn-1',
          revisionId: 'rev-1',
          timestamp: '2026-05-24T00:00:00.000Z',
          source: 'backend',
          payload: {
            toolName: 'read_file',
            requestId: 'request-1',
            structuredPayload: {
              tool_name: 'read_file',
              request_id: 'request-1',
              parameters: { file_path: '/tmp/a' },
            },
          },
        } as any, 'conversation-1');

        result.current.handleToolOutput({
          eventId: 'event-tool-output',
          type: 'tool_output',
          conversationRef: 'conversation-1',
          turnRef: 'turn-1',
          revisionId: 'rev-1',
          timestamp: '2026-05-24T00:00:01.000Z',
          source: 'sidecar',
          payload: {
            toolName: 'read_file',
            requestId: 'request-1',
            output: 'done',
          },
        } as any, 'conversation-1');

        result.current.handleToolBundle({
          eventId: 'event-tool-bundle',
          type: 'tool_bundle_call',
          conversationRef: 'conversation-1',
          turnRef: 'turn-1',
          revisionId: 'rev-1',
          timestamp: '2026-05-24T00:00:02.000Z',
          source: 'backend',
          payload: {
            bundleId: 'bundle-1',
            tools: [{ name: 'read_file' }],
          },
        } as any, 'conversation-1');

        result.current.handleToolOutput({
          eventId: 'event-tool-bundle-output',
          type: 'tool_bundle_output',
          conversationRef: 'conversation-1',
          turnRef: 'turn-1',
          revisionId: 'rev-1',
          timestamp: '2026-05-24T00:00:03.000Z',
          source: 'sidecar',
          payload: {
            bundleId: 'bundle-1',
            stepResults: [{ tool: 'read_file', output: { output: 'README' } }],
          },
        } as any, 'conversation-1');
      });
    }).not.toThrow();
  });
});
