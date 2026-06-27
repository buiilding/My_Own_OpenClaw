/** @jest-environment node */

const {
  createConversationMetadataDiagnosticsRuntime,
} = require('../../src/main/ipc/ipc_conversation_metadata_diagnostics_runtime.cjs');

const metadataDiagnosticsRuntimeModule = require('../../src/main/ipc/ipc_conversation_metadata_diagnostics_runtime.cjs');

describe('ipc_conversation_metadata_diagnostics_runtime', () => {
  test('normalizes renderer diagnostic context with state fallbacks', () => {
    const runtime = createConversationMetadataDiagnosticsRuntime();

    expect(runtime.createContext({
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

    expect(runtime.createContext({}, {
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
    expect(metadataDiagnosticsRuntimeModule.normalizeAppDiagnosticContext).toBeUndefined();
  });

  test('records metadata list diagnostics with request and duration data', () => {
    const runtime = createConversationMetadataDiagnosticsRuntime();
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

    const result = runtime.record(appendAppDiagnostic, context, {
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
    expect(metadataDiagnosticsRuntimeModule.recordConversationMetadataListDiagnostic).toBeUndefined();
  });
});
