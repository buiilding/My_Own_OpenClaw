/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createAgentBackendEventRuntime,
} = require('../../src/main/ipc/ipc_agent_backend_event_runtime.cjs');
const backendEventRuntimeModule = require('../../src/main/ipc/ipc_agent_backend_event_runtime.cjs');

function createDeps(overrides = {}) {
  let activeQueryContext = {
    queryMessageId: 'turn-1',
    accepted: false,
  };
  const deps = {
    getActiveQueryContext: jest.fn(() => activeQueryContext),
    setActiveQueryContext: jest.fn((value) => {
      activeQueryContext = value;
    }),
    appendForActiveTurn: jest.fn(),
    clearEventReplayState: jest.fn(),
    noteBackendTraffic: jest.fn(),
    notifyBackendMessageObservers: jest.fn(),
    processBackendMessageData: jest.fn(),
    processBackendMessageDeps: { setResponseOverlayPhase: jest.fn() },
    getActiveQueryContextValue: () => activeQueryContext,
    ...overrides,
  };
  return deps;
}

describe('ipc_agent_backend_event_runtime', () => {
  function handleBackendEvent(event, deps) {
    const runtime = createAgentBackendEventRuntime(deps);
    return runtime.handle(event);
  }

  test('keeps active-turn and terminal-event classifiers private to the runtime owner', () => {
    expect(backendEventRuntimeModule.eventMatchesActiveTurn).toBeUndefined();
    expect(backendEventRuntimeModule.isTerminalBackendEvent).toBeUndefined();
  });

  test('marks active query accepted and relays backend events through replay, traffic, observers, and processor', () => {
    const deps = createDeps();
    const event = {
      type: 'query-accepted',
      turn_ref: 'turn-1',
    };

    handleBackendEvent(event, deps);

    expect(deps.getActiveQueryContextValue()).toEqual({
      queryMessageId: 'turn-1',
      accepted: true,
    });
    expect(deps.appendForActiveTurn).toHaveBeenCalledWith(event);
    expect(deps.noteBackendTraffic).toHaveBeenCalledWith('message:query-accepted');
    expect(deps.notifyBackendMessageObservers).toHaveBeenCalledWith(event);
    expect(deps.processBackendMessageData).toHaveBeenCalledWith(
      event,
      deps.processBackendMessageDeps,
    );
  });

  test('clears active query context and replay after matching terminal events', () => {
    const deps = createDeps();

    handleBackendEvent({
      type: 'streaming-complete',
      turn_ref: 'turn-1',
    }, deps);

    expect(deps.setActiveQueryContext).toHaveBeenCalledWith(null);
    expect(deps.clearEventReplayState).toHaveBeenCalledTimes(1);
    expect(deps.getActiveQueryContextValue()).toBeNull();
  });

  test('does not clear active context for stale terminal events', () => {
    const deps = createDeps();

    handleBackendEvent({
      type: 'streaming-complete',
      turn_ref: 'turn-2',
    }, deps);

    expect(deps.setActiveQueryContext).not.toHaveBeenCalled();
    expect(deps.clearEventReplayState).not.toHaveBeenCalled();
    expect(deps.getActiveQueryContextValue()).toEqual({
      queryMessageId: 'turn-1',
      accepted: false,
    });
  });

  test('does not mark active query accepted for stale accepted events', () => {
    const deps = createDeps();

    handleBackendEvent({
      type: 'query-accepted',
      turn_ref: 'turn-2',
    }, deps);

    expect(deps.getActiveQueryContextValue()).toEqual({
      queryMessageId: 'turn-1',
      accepted: false,
    });
  });

  test('does not clear active context for matching non-terminal events', () => {
    const deps = createDeps();

    handleBackendEvent({
      type: 'query-accepted',
      turn_ref: 'turn-1',
    }, deps);

    expect(deps.setActiveQueryContext).not.toHaveBeenCalled();
    expect(deps.clearEventReplayState).not.toHaveBeenCalled();
    expect(deps.getActiveQueryContextValue()).toEqual({
      queryMessageId: 'turn-1',
      accepted: true,
    });
  });

  test('preserves historical unknown traffic labels for invalid events', () => {
    const deps = createDeps();

    handleBackendEvent(null, deps);

    expect(deps.appendForActiveTurn).toHaveBeenCalledWith(null);
    expect(deps.noteBackendTraffic).toHaveBeenCalledWith('message:unknown');
    expect(deps.notifyBackendMessageObservers).toHaveBeenCalledWith(null);
    expect(deps.processBackendMessageData).toHaveBeenCalledWith(
      null,
      deps.processBackendMessageDeps,
    );
  });

  test('runtime wrapper relays events through composed dependencies', () => {
    const deps = createDeps();
    const runtime = createAgentBackendEventRuntime(deps);
    const event = {
      type: 'query-accepted',
      turn_ref: 'turn-1',
    };

    runtime.handle(event);

    expect(deps.getActiveQueryContextValue()).toEqual({
      queryMessageId: 'turn-1',
      accepted: true,
    });
    expect(deps.processBackendMessageData).toHaveBeenCalledWith(
      event,
      deps.processBackendMessageDeps,
    );
  });

  test('ipc.cjs delegates backend event relay bookkeeping to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_backend_event_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentBackendEventRuntime({');
    expect(mainSource).toContain('agentBackendEventRuntime.handle(rendererData)');
    expect(mainSource).not.toContain('handleAgentBackendEventRuntime(rendererData');
    expect(mainSource).not.toContain("rendererData.type === 'query-accepted'");
    expect(mainSource).not.toContain("rendererData.type === 'streaming-complete'");
    expect(helperSource).toContain('function createAgentBackendEventRuntime');
    const backendEventRuntimeModule = require('../../src/main/ipc/ipc_agent_backend_event_runtime.cjs');
    expect(backendEventRuntimeModule.handleAgentBackendEventRuntime).toBeUndefined();
    expect(helperSource).toContain("event.type === 'query-accepted'");
    expect(helperSource).toContain("event.type === 'streaming-complete'");
  });
});
