import { isBackendEvent } from '../../frontend/src/renderer/types/backendEvents';

describe('backend event guard', () => {
  test('accepts known event envelopes with valid optional payload fields', () => {
    expect(isBackendEvent({
      type: 'streaming-response',
      id: 'evt-1',
      session_id: 'session-1',
      user_id: 'user-1',
      conversation_ref: 'conversation-1',
      turn_ref: 'turn-1',
      payload: { text: 'hello' },
    })).toBe(true);

    expect(isBackendEvent({
      type: 'tool-call',
      payload: {
        tool_name: 'read_file',
        parameters: { path: 'README.md' },
        metadata: {
          skip_frontend_execution: false,
          model_facing_tool_call: {
            id: 'call-1',
            name: 'read_file',
            arguments: { path: 'README.md' },
          },
        },
      },
    })).toBe(true);

    expect(isBackendEvent({ type: 'query-accepted' })).toBe(true);
  });

  test('rejects known event types with malformed envelopes', () => {
    expect(isBackendEvent({ type: 'streaming-response', id: 7 })).toBe(false);
    expect(isBackendEvent({ type: 'streaming-response', payload: 'hello' })).toBe(false);
    expect(isBackendEvent({ type: 'not-a-real-event', payload: {} })).toBe(false);
  });

  test('rejects payload fields that do not match the typed event contract', () => {
    expect(isBackendEvent({ type: 'streaming-response', payload: { text: 42 } })).toBe(false);
    expect(isBackendEvent({ type: 'tool-call', payload: { parameters: [] } })).toBe(false);
    expect(isBackendEvent({ type: 'tool-output', payload: { success: 'yes' } })).toBe(false);
    expect(isBackendEvent({ type: 'tool-bundle', payload: { tools: { name: 'read_file' } } })).toBe(false);
    expect(isBackendEvent({ type: 'local-user-message', payload: { screenshot_refs: ['a', 3] } })).toBe(false);
    expect(isBackendEvent({ type: 'token-count', payload: { total_tokens: true } })).toBe(false);
    expect(isBackendEvent({ type: 'token-count', payload: { usage_source: 'remote' } })).toBe(false);
    expect(isBackendEvent({ type: 'tool-schemas', payload: { tool_schemas: [{ name: 'read_file' }] } })).toBe(false);
  });
});
