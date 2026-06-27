/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createAgentBackendCloseRuntime,
} = require('../../src/main/ipc/ipc_agent_backend_close_runtime.cjs');
const backendCloseRuntimeModule = require('../../src/main/ipc/ipc_agent_backend_close_runtime.cjs');

function createCloseDeps(overrides = {}) {
  return {
    setConnected: jest.fn(),
    markInferenceContextsStale: jest.fn(),
    resetSettingsSyncState: jest.fn(),
    getResponseOverlayPhase: jest.fn(() => 'idle'),
    getActiveQueryContext: jest.fn(() => null),
    setActiveQueryContext: jest.fn(),
    getCurrentSessionId: jest.fn(() => 'session-1'),
    getCurrentServerUserId: jest.fn(() => 'server-user'),
    getCurrentUserId: jest.fn(() => 'client-user'),
    getQueryEventsCopy: jest.fn(() => ({ interruptedAfterAccept: 'interrupted' })),
    buildQueryInterrupted: jest.fn(() => ({ type: 'error', turn_ref: 'turn-1' })),
    handleAgentBackendEvent: jest.fn(),
    setResponseOverlayPhase: jest.fn(),
    resetBackendSessionState: jest.fn(),
    clearEventReplayState: jest.fn(),
    log: jest.fn(),
    broadcastConnectionStatus: jest.fn(),
    ...overrides,
  };
}

describe('ipc_agent_backend_close_runtime', () => {
  function handleBackendClose(event, deps) {
    const runtime = createAgentBackendCloseRuntime(deps);
    return runtime.handle(event);
  }

  test('keeps interrupted-close classification private to the runtime owner', () => {
    expect(backendCloseRuntimeModule.shouldInterruptActiveQueryOnClose).toBeUndefined();
  });

  test.each([
    'awaiting-first-chunk',
    'streaming',
    'tool-call',
    'tool-output',
  ])('synthesizes interrupted query events for active %s backend closes', (activePhase) => {
    const deps = createCloseDeps({
      getResponseOverlayPhase: jest.fn(() => activePhase),
      getActiveQueryContext: jest.fn(() => ({
        queryMessageId: 'turn-1',
        conversationRef: 'conv-1',
        accepted: true,
      })),
    });

    const result = handleBackendClose({ shouldReconnect: true }, deps);

    expect(result).toEqual({ interrupted: true });
    expect(deps.handleAgentBackendEvent).toHaveBeenCalledWith({ type: 'error', turn_ref: 'turn-1' });
    expect(deps.setActiveQueryContext).toHaveBeenCalledWith(null);
    expect(deps.setResponseOverlayPhase).not.toHaveBeenCalled();
  });

  test('synthesizes interrupted query events for active backend closes', () => {
    const deps = createCloseDeps({
      getResponseOverlayPhase: jest.fn(() => 'streaming'),
      getActiveQueryContext: jest.fn(() => ({
        queryMessageId: 'turn-1',
        conversationRef: 'conv-1',
        accepted: true,
      })),
    });

    const result = handleBackendClose({ shouldReconnect: true }, deps);

    expect(result).toEqual({ interrupted: true });
    expect(deps.setConnected).toHaveBeenCalledWith(false);
    expect(deps.markInferenceContextsStale).toHaveBeenCalledTimes(1);
    expect(deps.resetSettingsSyncState).toHaveBeenCalledTimes(1);
    expect(deps.buildQueryInterrupted).toHaveBeenCalledWith({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      currentSessionId: 'session-1',
      currentServerUserId: 'server-user',
      currentUserId: 'client-user',
      accepted: true,
      copy: { interruptedAfterAccept: 'interrupted' },
    });
    expect(deps.log).toHaveBeenCalledWith(
      'Active query interrupted by backend disconnect (turn_ref=turn-1, accepted=true).',
    );
    expect(deps.handleAgentBackendEvent).toHaveBeenCalledWith({ type: 'error', turn_ref: 'turn-1' });
    expect(deps.setActiveQueryContext).toHaveBeenCalledWith(null);
    expect(deps.setResponseOverlayPhase).not.toHaveBeenCalled();
    expect(deps.resetBackendSessionState).toHaveBeenCalledTimes(1);
    expect(deps.clearEventReplayState).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith('Disconnected from agent backend. Attempting to reconnect...');
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(false);
  });

  test('resets overlay phase for idle backend closes without an interrupted query', () => {
    const deps = createCloseDeps({
      getResponseOverlayPhase: jest.fn(() => 'idle'),
      getActiveQueryContext: jest.fn(() => ({
        queryMessageId: 'turn-1',
        conversationRef: 'conv-1',
        accepted: false,
      })),
    });

    const result = handleBackendClose({ closeReason: 'idle' }, deps);

    expect(result).toEqual({ interrupted: false });
    expect(deps.buildQueryInterrupted).not.toHaveBeenCalled();
    expect(deps.handleAgentBackendEvent).not.toHaveBeenCalled();
    expect(deps.setActiveQueryContext).not.toHaveBeenCalled();
    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith('idle', 'ws-close');
    expect(deps.resetBackendSessionState).toHaveBeenCalledTimes(1);
    expect(deps.clearEventReplayState).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith('Disconnected from agent backend (idle).');
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(false);
  });

  test('runtime wrapper handles backend close events through composed dependencies', () => {
    const deps = createCloseDeps({
      getResponseOverlayPhase: jest.fn(() => 'streaming'),
      getActiveQueryContext: jest.fn(() => ({
        queryMessageId: 'turn-1',
        conversationRef: 'conv-1',
        accepted: true,
      })),
    });
    const runtime = createAgentBackendCloseRuntime(deps);

    expect(runtime.handle({ shouldReconnect: true })).toEqual({ interrupted: true });

    expect(deps.setConnected).toHaveBeenCalledWith(false);
    expect(deps.handleAgentBackendEvent).toHaveBeenCalledWith({ type: 'error', turn_ref: 'turn-1' });
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(false);
  });

  test('ipc.cjs delegates backend close cleanup to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_backend_close_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentBackendCloseRuntime({');
    expect(mainSource).toContain('agentBackendCloseRuntime.handle({ closeReason, shouldReconnect })');
    expect(mainSource).not.toContain('handleAgentBackendCloseEvent({ closeReason, shouldReconnect }');
    expect(mainSource).not.toContain('Active query interrupted by backend disconnect');
    expect(mainSource).not.toContain("activePhase === 'streaming'");
    expect(helperSource).toContain('function createAgentBackendCloseRuntime');
    const backendCloseRuntimeModule = require('../../src/main/ipc/ipc_agent_backend_close_runtime.cjs');
    expect(backendCloseRuntimeModule.handleAgentBackendCloseEvent).toBeUndefined();
    expect(helperSource).toContain('Active query interrupted by backend disconnect');
    expect(helperSource).toContain("'streaming'");
  });
});
