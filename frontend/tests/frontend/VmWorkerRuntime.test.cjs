/** @jest-environment node */

const {
  createVmWorkerRuntime,
} = require('../../src/main/app/vm_worker_runtime.cjs');

const sampleVmWorkerEnv = Object.freeze({
  workspaceId: 'SAMPLE_VM_WORKSPACE_ID',
  workerId: 'SAMPLE_VM_WORKER_ID',
  vmId: 'SAMPLE_VM_ID',
  agentId: 'SAMPLE_VM_AGENT_ID',
  heartbeatMs: 'SAMPLE_VM_WORKER_HEARTBEAT_MS',
  runsApiKeys: Object.freeze([
    'SAMPLE_VM_RUNS_API_KEY',
    'SAMPLE_RUNS_API_KEY',
  ]),
});

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createDeferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('vm_worker_runtime', () => {
  test('uses configured heartbeat interval only for strict millisecond integers', () => {
    const intervals = [];
    const createRuntime = (heartbeatValue) => createVmWorkerRuntime({
      env: {
        SAMPLE_VM_WORKER_HEARTBEAT_MS: heartbeatValue,
      },
      vmWorkerEnv: sampleVmWorkerEnv,
      fetchFn: jest.fn(),
      getBackendConnectionState: () => ({ isConnected: false }),
      sendAutomatedQuery: jest.fn(),
      stopQueryThroughAgentSdkRuntime: jest.fn(),
      registerBackendMessageObserver: () => () => {},
      setIntervalFn: (_handler, ms) => {
        intervals.push(ms);
        return intervals.length;
      },
      clearIntervalFn: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    });

    createRuntime(' 2500 ').start();
    createRuntime('2500ms').start();
    createRuntime('1000.5').start();
    createRuntime('999').start();

    expect(intervals).toEqual([
      2500,
      5000,
      5000,
      5000,
    ]);
  });

  test('buildAttachmentContextFromFiles renders artifact list', () => {
    const runtime = createVmWorkerRuntime({
      env: {
        SAMPLE_VM_WORKSPACE_ID: 'workspace-demo',
      },
      vmWorkerEnv: sampleVmWorkerEnv,
      fetchFn: jest.fn(),
      getBackendConnectionState: () => ({ isConnected: false }),
      sendAutomatedQuery: jest.fn(),
      stopQueryThroughAgentSdkRuntime: jest.fn(),
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
        SAMPLE_VM_WORKSPACE_ID: 'workspace-demo',
        SAMPLE_VM_WORKER_HEARTBEAT_MS: '9999',
        SAMPLE_VM_RUNS_API_KEY: 'worker-runs-key',
      },
      vmWorkerEnv: sampleVmWorkerEnv,
      fetchFn,
      getBackendConnectionState: () => ({
        isConnected: true,
        userId: 'vm-user-1',
        sessionId: 'session-1',
        backendHttpUrl: 'http://localhost:8000',
      }),
      sendAutomatedQuery,
      stopQueryThroughAgentSdkRuntime: jest.fn(),
      registerBackendMessageObserver: (handler) => {
        observer = handler;
        return () => {
          observer = null;
        };
      },
      runsApiKeyHeader: 'x-sample-runs-key',
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
          'x-sample-runs-key': 'worker-runs-key',
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

  test('does not bake hosted runs auth header into generic worker runtime', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        worker: { worker_id: 'worker-auth' },
        assigned_run: null,
        control_commands: [],
      }),
    }));
    const runtime = createVmWorkerRuntime({
      env: {
        SAMPLE_VM_RUNS_API_KEY: 'worker-runs-key',
        SAMPLE_VM_WORKER_HEARTBEAT_MS: '9999',
      },
      vmWorkerEnv: sampleVmWorkerEnv,
      fetchFn,
      getBackendConnectionState: () => ({
        isConnected: true,
        userId: 'vm-user-auth',
        backendHttpUrl: 'http://localhost:8000',
      }),
      sendAutomatedQuery: jest.fn(),
      stopQueryThroughAgentSdkRuntime: jest.fn(),
      registerBackendMessageObserver: () => () => {},
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
        headers: expect.not.objectContaining({
          'x-sample-runs-key': 'worker-runs-key',
        }),
      }),
    );
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
        SAMPLE_VM_WORKSPACE_ID: 'workspace-demo',
      },
      vmWorkerEnv: sampleVmWorkerEnv,
      fetchFn,
      getBackendConnectionState: () => ({
        isConnected: true,
        userId: 'vm-user-2',
        sessionId: 'session-2',
        backendHttpUrl: 'http://localhost:8000',
      }),
      sendAutomatedQuery,
      stopQueryThroughAgentSdkRuntime: jest.fn(),
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

  test('applies stop controls through typed backend stop adapter', async () => {
    const sendAutomatedQuery = jest.fn(async () => ({
      ok: true,
      queryMessageId: 'turn-stop',
      messageId: 'turn-stop',
    }));
    const stopQueryThroughAgentSdkRuntime = jest.fn();
    let heartbeatCount = 0;
    let intervalHandler = null;
    const fetchFn = jest.fn(async (url) => {
      if (url.endsWith('/api/runs/workers/heartbeat')) {
        heartbeatCount += 1;
        if (heartbeatCount === 1) {
          return {
            ok: true,
            json: async () => ({
              worker: { worker_id: 'worker-stop' },
              assigned_run: {
                run_id: 'run-stop',
                workspace_id: 'workspace-demo',
                conversation_ref: 'conv-stop',
                query: 'run task',
                files: [],
              },
              control_commands: [],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            worker: { worker_id: 'worker-stop' },
            assigned_run: null,
            control_commands: [{
              action: 'stop',
              run_id: 'run-stop',
              command_id: 'cmd-stop',
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true }),
      };
    });

    const runtime = createVmWorkerRuntime({
      env: {
        SAMPLE_VM_WORKSPACE_ID: 'workspace-demo',
      },
      vmWorkerEnv: sampleVmWorkerEnv,
      fetchFn,
      getBackendConnectionState: () => ({
        isConnected: true,
        userId: 'vm-user-stop',
        sessionId: 'session-stop',
        backendHttpUrl: 'http://localhost:8000',
      }),
      sendAutomatedQuery,
      stopQueryThroughAgentSdkRuntime,
      registerBackendMessageObserver: () => () => {},
      setIntervalFn: (handler) => {
        intervalHandler = handler;
        return 1;
      },
      clearIntervalFn: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    });

    runtime.start();
    await flushPromises();
    await intervalHandler();
    await flushPromises();

    expect(stopQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      conversation_ref: 'conv-stop',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/api/runs/run-stop/events',
      expect.objectContaining({ method: 'POST' }),
    );
    runtime.stop();
  });

  test('reserves conversation mapping while automated query dispatch is pending', async () => {
    const deferredDispatch = createDeferred();
    const sendAutomatedQuery = jest.fn(() => deferredDispatch.promise);
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    const runtime = createVmWorkerRuntime({
      env: { SAMPLE_VM_WORKSPACE_ID: 'workspace-demo' },
      vmWorkerEnv: sampleVmWorkerEnv,
      fetchFn,
      getBackendConnectionState: () => ({
        isConnected: true,
        userId: 'vm-user-race',
        backendHttpUrl: 'http://localhost:8000',
      }),
      sendAutomatedQuery,
      stopQueryThroughAgentSdkRuntime: jest.fn(),
      registerBackendMessageObserver: () => () => {},
      log: jest.fn(),
      warn: jest.fn(),
    });

    const firstDispatch = runtime._internals.dispatchAssignedRun({
      backendHttpUrl: 'http://localhost:8000',
      userId: 'vm-user-race',
      workerId: 'worker-race',
      assignedRun: {
        run_id: 'run-race-1',
        conversation_ref: 'conv-race',
        query: 'first task',
      },
    });
    await flushPromises();

    expect(runtime._internals.getActiveRunCount()).toBe(1);
    await runtime._internals.dispatchAssignedRun({
      backendHttpUrl: 'http://localhost:8000',
      userId: 'vm-user-race',
      workerId: 'worker-race',
      assignedRun: {
        run_id: 'run-race-2',
        conversation_ref: 'conv-race',
        query: 'second task',
      },
    });
    expect(sendAutomatedQuery).toHaveBeenCalledTimes(1);

    deferredDispatch.resolve({
      ok: true,
      queryMessageId: 'turn-race-1',
      messageId: 'turn-race-1',
    });
    await firstDispatch;

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/api/runs/run-race-1/worker-dispatched',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
