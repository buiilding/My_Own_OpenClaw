/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  buildConversationEventFromBackendEvent,
} = require('../../frontend/src/main/ipc/ipc_conversation_event_projection.cjs');

describe('ipc_conversation_event_projection', () => {
  test('normalizes replayable backend events into SDK conversation events', () => {
    const event = {
      type: 'streaming-response',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
      event_id: 'evt-1',
      sequence: 1,
      payload: {
        text: 'hello',
      },
    };

    expect(buildConversationEventFromBackendEvent(event, {
      fallbackRevisionId: 'rev-1',
    })).toEqual(expect.objectContaining({
      eventId: 'evt-1',
      type: 'assistant_delta',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      revisionId: 'rev-1',
      source: 'backend',
      payload: expect.objectContaining({
        text: 'hello',
        backendSequence: 1,
        sourceEventType: 'streaming-response',
        sourceEvent: event,
      }),
    }));
  });

  test('uses fallback conversation identity only for scoped backend errors', () => {
    const event = {
      type: 'error',
      id: 'turn-1',
      payload: {
        message: 'boom',
      },
    };

    expect(buildConversationEventFromBackendEvent(event, {
      fallbackConversationRef: 'conv-fallback',
      fallbackRevisionId: 'rev-1',
      fallbackTurnRef: 'turn-1',
    })).toEqual(expect.objectContaining({
      type: 'turn_error',
      conversationRef: 'conv-fallback',
      turnRef: 'turn-1',
      revisionId: 'rev-1',
      payload: expect.objectContaining({
        message: 'boom',
        sourceEventType: 'error',
        sourceEvent: event,
      }),
    }));
  });

  test('rejects invalid envelopes and non-error events without conversation refs', () => {
    expect(buildConversationEventFromBackendEvent(null)).toBeNull();
    expect(buildConversationEventFromBackendEvent([])).toBeNull();
    expect(buildConversationEventFromBackendEvent({
      type: 'streaming-response',
      turn_ref: 'turn-1',
      event_id: 'evt-1',
      sequence: 1,
      payload: { text: 'hello' },
    }, {
      fallbackConversationRef: 'conv-fallback',
    })).toBeNull();
  });

  test('ipc.cjs delegates replay conversation event projection to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_conversation_event_projection.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('buildConversationEventFromBackendEvent(event');
    expect(mainSource).not.toContain('normalizeBackendEventToConversationEvent');
    expect(helperSource).toContain('normalizeBackendEventToConversationEvent');
    expect(helperSource).toContain('fallbackConversationRef: options.fallbackConversationRef');
  });
});
