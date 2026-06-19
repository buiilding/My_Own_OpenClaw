/** @jest-environment node */

const {
  normalizeAppDiagnosticContext,
  recordConversationMetadataListDiagnostic,
} = require('../../frontend/src/main/ipc/ipc_conversation_metadata_diagnostics_runtime.cjs');

describe('ipc_conversation_metadata_diagnostics_runtime', () => {
  test('normalizes renderer diagnostic context with state fallbacks', () => {
    expect(normalizeAppDiagnosticContext({
      _diagnostics: {
        path: ' conversation.metadata.list ',
        traceId: ' trace-1 ',
        parentSpanId: ' parent-1 ',
        requestId: ' req-1 ',
      },
    }, {
      currentSessionId: 'session-1',
      currentConversationRef: 'conv-1',
    })).toEqual({
      path: 'conversation.metadata.list',
      traceId: 'trace-1',
      parentSpanId: 'parent-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      conversationRef: 'conv-1',
    });

    expect(normalizeAppDiagnosticContext({}, {
      currentSessionId: 'session-fallback',
      currentConversationRef: 'conv-fallback',
    })).toEqual({
      path: 'conversation.metadata.list',
      traceId: undefined,
      parentSpanId: null,
      requestId: undefined,
      sessionId: 'session-fallback',
      conversationRef: 'conv-fallback',
    });
  });

  test('records metadata list diagnostics with request and duration data', () => {
    const appendAppDiagnostic = jest.fn(event => ({
      ...event,
      traceId: event.traceId || 'trace-created',
    }));
    const context = {
      path: 'conversation.metadata.list',
      requestId: 'req-1',
      sessionId: 'session-1',
      conversationRef: 'conv-1',
    };

    const result = recordConversationMetadataListDiagnostic(appendAppDiagnostic, context, {
      stage: 'sdk_list',
      status: 'failed',
      runtime: 'electron-main',
      durationMs: 25,
      data: {
        localRuntimeReady: false,
      },
      error: new Error('failed'),
    });

    expect(appendAppDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      path: 'conversation.metadata.list',
      traceId: undefined,
      parentSpanId: null,
      requestId: 'req-1',
      sessionId: 'session-1',
      conversationRef: 'conv-1',
      stage: 'sdk_list',
      status: 'failed',
      runtime: 'electron-main',
      durationMs: 25,
      data: {
        localRuntimeReady: false,
        requestId: 'req-1',
        durationMs: 25,
      },
      error: expect.any(Error),
    }));
    expect(result.traceId).toBe('trace-created');
    expect(context.traceId).toBe('trace-created');
  });
});
