/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const mainProcessTraceModule = require('../../src/main/ipc/ipc_main_process_trace_runtime.cjs');
const {
  createMainProcessTraceRuntime,
} = mainProcessTraceModule;

class FakeTraceRecorder {
  constructor(options) {
    this.options = options;
  }

  async record(input) {
    await this.options.emit({
      ...input,
      traceId: 'trace-1',
      spanId: 'span-1',
    });
    return {
      traceId: 'trace-1',
      spanId: 'span-1',
    };
  }
}

function createRuntime(overrides = {}) {
  const appendConversationEvent = jest.fn(async () => ({ ok: true }));
  const agent = { appendConversationEvent };
  const deps = {
    ensureAgent: jest.fn(async () => agent),
    appendAppDiagnostic: jest.fn((event) => ({ stored: true, event })),
    permissionProbeDiagnosticsPath: 'permission.probe',
    TraceRecorder: FakeTraceRecorder,
    createConversationEvent: jest.fn((event) => ({
      wrapped: true,
      ...event,
    })),
    ...overrides,
  };
  return {
    agent,
    appendConversationEvent,
    deps,
    runtime: createMainProcessTraceRuntime(deps),
  };
}

describe('ipc_main_process_trace_runtime', () => {
  test('records idle permission probes as app diagnostics without requiring an agent', async () => {
    const { deps, runtime } = createRuntime();

    await expect(runtime.appendMainProcessTraceEvent({
      path: ' permission.probe ',
      stage: ' probe:succeeded ',
      status: ' succeeded ',
      runtime: ' electron-main ',
      requestId: ' request-1 ',
      durationMs: 12.8,
      data: { permissionId: 'filesystem_workspace_access' },
      error: null,
    })).resolves.toEqual({
      stored: true,
      event: expect.objectContaining({
        path: 'permission.probe',
        stage: 'probe:succeeded',
        status: 'succeeded',
        runtime: 'electron-main',
        requestId: 'request-1',
        durationMs: 12,
        data: { permissionId: 'filesystem_workspace_access' },
      }),
    });

    expect(deps.ensureAgent).not.toHaveBeenCalled();
    expect(deps.appendAppDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      path: 'permission.probe',
      stage: 'probe:succeeded',
    }));
  });

  test('rejects non-permission traces that have no conversation or turn context', async () => {
    const { deps, runtime } = createRuntime();

    await expect(runtime.appendMainProcessTraceEvent({
      path: 'surface.visibility',
    })).resolves.toEqual({
      stored: false,
      reason: 'missing_conversation_ref',
    });
    await expect(runtime.appendMainProcessTraceEvent({
      path: 'surface.visibility',
      conversationRef: 'conv-1',
    })).resolves.toEqual({
      stored: false,
      reason: 'missing_turn_ref',
    });

    expect(deps.ensureAgent).not.toHaveBeenCalled();
  });

  test('records conversation-scoped traces through the SDK trace event writer', async () => {
    const { appendConversationEvent, deps, runtime } = createRuntime();

    await expect(runtime.appendMainProcessTraceEvent({
      path: 'permission.probe',
      stage: 'probe:succeeded',
      status: 'succeeded',
      runtime: 'electron-main',
      requestId: 'request-1',
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
      data: { permissionId: 'filesystem_workspace_access' },
    })).resolves.toEqual({
      stored: true,
      traceId: 'trace-1',
      spanId: 'span-1',
    });

    expect(deps.ensureAgent).toHaveBeenCalledWith({
      reason: 'main-process-trace',
      conversationRef: 'conv-1',
    });
    expect(deps.createConversationEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'trace_event',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      source: 'ui',
      payload: expect.objectContaining({
        path: 'permission.probe',
        stage: 'probe:succeeded',
        traceId: 'trace-1',
        spanId: 'span-1',
      }),
    }));
    expect(appendConversationEvent).toHaveBeenCalledWith(expect.objectContaining({
      wrapped: true,
      type: 'trace_event',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    }));
  });

  test('ipc.cjs delegates main-process trace event routing to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_main_process_trace_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createMainProcessTraceRuntime({');
    expect(mainSource).not.toContain("path === PERMISSION_PROBE_DIAGNOSTICS_PATH");
    expect(mainSource).not.toContain("reason: 'main-process-trace'");
    expect(mainSource).not.toContain("type: 'trace_event'");
    expect(helperSource).toContain("path === permissionProbeDiagnosticsPath");
    expect(helperSource).toContain("reason: 'main-process-trace'");
    expect(helperSource).toContain("type: 'trace_event'");
    expect(mainProcessTraceModule.isPlainObject).toBeUndefined();
    expect(mainProcessTraceModule.normalizeOptionalString).toBeUndefined();
    expect(mainProcessTraceModule.normalizePositiveInteger).toBeUndefined();
  });
});
