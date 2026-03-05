/** @jest-environment node */

const {
  createVmWorkerRuntime,
} = require('../../frontend/src/main/vm_worker_runtime.cjs');

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('vm_worker_runtime', () => {
  test('buildAttachmentContextFromFiles renders artifact list', () => {
    const runtime = createVmWorkerRuntime({
      env: {
        WINDIE_VM_WORKSPACE_ID: 'workspace-demo',
      },
      fetchFn: jest.fn(),
      getBackendConnectionState: () => ({ isConnected: false }),
      sendAutomatedQuery: jest.fn(),
      sendMessageToBackend: jest.fn(),
      registerBackendMessageObserver: () => () => {},
    });
    const context = runtime._internals.buildAttachmentContextFromFiles([
      {
        artifact_id: 'artifact-1',
        filename: 'resume.pdf',
        content_type: 'application/pdf',
      },
      {
        artifact_id: 'artifact-2',
      },
    ]);

    expect(context).toContain('artifact_id=artifact-1');
    expect(context).toContain('filename=resume.pdf');
    expect(context).toContain('artifact_id=artifact-2');
  });

  test('claims run via heartbeat and dispatches automated query', async () => {
    const sendAutomatedQuery = jest.fn(async () => ({
      ok: true,
      queryMessageId: 'turn-1',
      messageId: 'turn-1',
    }));
    const fetchFn = jest.fn(async (url) => {
      if (url.endsWith('/api/runs/workers/heartbeat')) {
        return {
          ok: true,
          json: async () => ({
            worker: { worker_id: 'worker-1' },
            assigned_run: {
              run_id: 'run-1',
              workspace_id: 'workspace-demo',
              conversation_ref: 'conv-run-1',
              query: 'apply this internship job for me',
              files: [{ artifact_id: 'artifact-1', filename: 'resume.pdf' }],
              metadata: {},
              control_mode: 'agent_only',
            },
            control_commands: [],
          }),
        };
      }
      if (url.endsWith('/api/runs/run-1/worker-dispatched')) {
        return {
          ok: true,
          json: async () => ({
            run: { run_id: 'run-1' },
            latest_event: { event_type: 'run-dispatched' },
          }),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    let observer = null;
    const runtime = createVmWorkerRuntime({
      env: {
        WINDIE_VM_WORKSPACE_ID: 'workspace-demo',
        WINDIE_VM_WORKER_MODE: '1',
        WINDIE_VM_WORKER_HEARTBEAT_MS: '9999',
        WINDIE_VM_RUNS_API_KEY: 'demo-runs-key',
      },
      fetchFn,
      getBackendConnectionState: () => ({
        isConnected: true,
        userId: 'vm-user-1',
        sessionId: 'session-1',
        backendHttpUrl: 'http://localhost:8000',
      }),
      sendAutomatedQuery,
      sendMessageToBackend: jest.fn(),
      registerBackendMessageObserver: (handler) => {
        observer = handler;
        return () => {
          observer = null;
        };
      },
      setIntervalFn: () => 1,
      clearIntervalFn: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    });

    runtime.start();
    await flushPromises();

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/api/runs/workers/heartbeat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-windie-runs-key': 'demo-runs-key',
        }),
      }),
    );
    expect(sendAutomatedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'apply this internship job for me',
        conversationRef: 'conv-run-1',
      }),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/api/runs/run-1/worker-dispatched',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(typeof observer).toBe('function');
    runtime.stop();
  });

  test('relays stream events for active run and stops after terminal event', async () => {
    const sendAutomatedQuery = jest.fn(async () => ({
      ok: true,
      queryMessageId: 'turn-2',
      messageId: 'turn-2',
    }));

    const fetchCalls = [];
    const fetchFn = jest.fn(async (url, options) => {
      fetchCalls.push([url, options]);
      if (url.endsWith('/api/runs/workers/heartbeat')) {
        return {
          ok: true,
          json: async () => ({
            worker: { worker_id: 'worker-2' },
            assigned_run: {
              run_id: 'run-2',
              workspace_id: 'workspace-demo',
              conversation_ref: 'conv-run-2',
              query: 'run task',
              files: [],
              metadata: {},
              control_mode: 'agent_only',
            },
            control_commands: [],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true }),
      };
    });

    let observer = null;
    const runtime = createVmWorkerRuntime({
      env: {
        WINDIE_VM_WORKSPACE_ID: 'workspace-demo',
        WINDIE_VM_WORKER_MODE: '1',
      },
      fetchFn,
      getBackendConnectionState: () => ({
        isConnected: true,
        userId: 'vm-user-2',
        sessionId: 'session-2',
        backendHttpUrl: 'http://localhost:8000',
      }),
      sendAutomatedQuery,
      sendMessageToBackend: jest.fn(),
      registerBackendMessageObserver: (handler) => {
        observer = handler;
        return () => {
          observer = null;
        };
      },
      setIntervalFn: () => 1,
      clearIntervalFn: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    });

    runtime.start();
    await flushPromises();
    await observer({
      type: 'streaming-response',
      conversation_ref: 'conv-run-2',
      payload: { text: 'chunk' },
    });
    await flushPromises();
    await observer({
      type: 'streaming-complete',
      conversation_ref: 'conv-run-2',
      payload: { final_response: 'done' },
    });
    await flushPromises();
    await observer({
      type: 'streaming-response',
      conversation_ref: 'conv-run-2',
      payload: { text: 'ignored after terminal' },
    });
    await flushPromises();

    const runEventCalls = fetchCalls.filter(([url]) => url.endsWith('/api/runs/run-2/events'));
    if (runEventCalls.length !== 2) {
      throw new Error(`Expected 2 run event calls, got ${runEventCalls.length}`);
    }
    runtime.stop();
  });
});
