/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createAgentConnectionEventsRuntime,
} = require('../../src/main/ipc/ipc_agent_connection_events.cjs');
const connectionEventsModule = require('../../src/main/ipc/ipc_agent_connection_events.cjs');

function createConnectionDeps(overrides = {}) {
  return {
    getCurrentUserId: jest.fn(() => 'current-user'),
    setCurrentServerUserId: jest.fn(),
    setConnected: jest.fn(),
    setFirstQuery: jest.fn(),
    traceBackendConnection: jest.fn(),
    resetSettingsSyncState: jest.fn(),
    setResponseOverlayPhase: jest.fn(),
    clearEventReplayState: jest.fn(),
    logMainRuntime: jest.fn(),
    log: jest.fn(),
    broadcastConnectionStatus: jest.fn(),
    handleAgentBackendClose: jest.fn(),
    ...overrides,
  };
}

describe('ipc_agent_connection_events', () => {
  function handleConnectionEvent(event, deps) {
    const runtime = createAgentConnectionEventsRuntime(deps);
    return runtime.handleConnection(event);
  }

  function handleBackendFallbackEvent(endpointPayload, deps) {
    const runtime = createAgentConnectionEventsRuntime(deps);
    return runtime.handleBackendFallback(endpointPayload);
  }

  test('keeps handshake and fallback resolution helpers private to the runtime owner', () => {
    expect(connectionEventsModule.resolveHandshakeUserId).toBeUndefined();
    expect(connectionEventsModule.resolveBackendFallbackIndex).toBeUndefined();
  });

  test('handles backend open events by updating session state and broadcasting status', () => {
    const deps = createConnectionDeps();

    handleConnectionEvent({
      type: 'open',
      handshake: { user_id: 'server-user' },
    }, deps);

    expect(deps.setCurrentServerUserId).toHaveBeenCalledWith('server-user');
    expect(deps.setConnected).toHaveBeenCalledWith(true);
    expect(deps.setFirstQuery).toHaveBeenCalledWith(true);
    expect(deps.traceBackendConnection).toHaveBeenCalledWith(expect.objectContaining({
      type: 'open',
    }));
    expect(deps.resetSettingsSyncState).toHaveBeenCalledTimes(1);
    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith('idle', 'ws-open');
    expect(deps.clearEventReplayState).toHaveBeenCalledTimes(1);
    expect(deps.logMainRuntime).toHaveBeenCalledWith('[Main][Backend] connected user=server-user');
    expect(deps.log).toHaveBeenCalledWith('Successfully connected to agent backend through Agent SDK runtime.');
    expect(deps.log).toHaveBeenCalledWith('Handshake sent with authenticated user_id: server-user');
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(true);
  });

  test('ignores camelCase handshake user aliases on backend open events', () => {
    const deps = createConnectionDeps();

    handleConnectionEvent({
      type: 'open',
      handshake: { userId: 'camel-user' },
    }, deps);

    expect(deps.setCurrentServerUserId).not.toHaveBeenCalled();
    expect(deps.logMainRuntime).toHaveBeenCalledWith('[Main][Backend] connected user=current-user');
    expect(deps.log).toHaveBeenCalledWith('Handshake sent with authenticated user_id: current-user');
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(true);
  });

  test('handles backend close events by delegating close interruption behavior', () => {
    const deps = createConnectionDeps();
    const event = {
      type: 'close',
      code: 1006,
      reason: 'network',
    };

    handleConnectionEvent(event, deps);

    expect(deps.traceBackendConnection).toHaveBeenCalledWith(event);
    expect(deps.logMainRuntime).toHaveBeenCalledWith('[Main][Backend] closed code=1006 reason=network');
    expect(deps.handleAgentBackendClose).toHaveBeenCalledWith(event);
    expect(deps.setConnected).not.toHaveBeenCalled();
  });

  test('handles backend error, handshake-error, and message-error diagnostics', () => {
    const deps = createConnectionDeps();

    handleConnectionEvent({
      type: 'error',
      error: new Error('socket exploded'),
    }, deps);
    handleConnectionEvent({
      type: 'handshake-error',
      error: 'bad handshake',
    }, deps);
    handleConnectionEvent({
      type: 'message-error',
      error: 'bad json',
    }, deps);

    expect(deps.traceBackendConnection).toHaveBeenCalledTimes(3);
    expect(deps.logMainRuntime).toHaveBeenCalledWith('[Main][Backend] error message="socket exploded"');
    expect(deps.logMainRuntime).toHaveBeenCalledWith('[Main][Backend] handshake_error message="bad handshake"');
    expect(deps.logMainRuntime).toHaveBeenCalledWith('[Main][Backend] message_error message="bad json"');
    expect(deps.log).toHaveBeenCalledWith('WebSocket error: socket exploded');
    expect(deps.log).toHaveBeenCalledWith('Error sending handshake: bad handshake');
    expect(deps.log).toHaveBeenCalledWith('Error parsing message from agent backend: bad json');
  });

  test('handles backend fallback by activating matched endpoint or advancing candidates', () => {
    const deps = {
      getEndpointCandidates: jest.fn(() => [
        { wsUrl: 'wss://primary.test/ws', httpUrl: 'https://primary.test' },
        { wsUrl: 'wss://fallback.test/ws', httpUrl: 'https://fallback.test' },
      ]),
      setActiveBackendEndpoint: jest.fn(),
      advanceToNextBackendEndpoint: jest.fn(),
      getCurrentEndpoint: jest.fn(() => ({ wsUrl: 'wss://fallback.test/ws' })),
      logMainRuntime: jest.fn(),
      log: jest.fn(),
    };

    handleBackendFallbackEvent({
      httpUrl: 'https://fallback.test',
    }, deps);
    expect(deps.setActiveBackendEndpoint).toHaveBeenCalledWith(1);
    expect(deps.advanceToNextBackendEndpoint).not.toHaveBeenCalled();
    expect(deps.logMainRuntime).toHaveBeenCalledWith('[Main][Backend] fallback ws=wss://fallback.test/ws');
    expect(deps.log).toHaveBeenCalledWith('Primary backend unavailable. Falling back to wss://fallback.test/ws.');

    deps.setActiveBackendEndpoint.mockClear();
    handleBackendFallbackEvent({
      httpUrl: 'https://missing.test',
    }, deps);
    expect(deps.setActiveBackendEndpoint).not.toHaveBeenCalled();
    expect(deps.advanceToNextBackendEndpoint).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['wsUrl', 'wss://fallback.test/ws'],
    ['httpBaseUrl', 'https://fallback.test'],
    ['backendUrl', 'https://fallback.test'],
  ])('handles backend fallback endpoint alias %s through the runtime', (key, value) => {
    const deps = {
      getEndpointCandidates: jest.fn(() => [
        { wsUrl: 'wss://primary.test/ws', httpUrl: 'https://primary.test' },
        { wsUrl: 'wss://fallback.test/ws', httpUrl: 'https://fallback.test' },
      ]),
      setActiveBackendEndpoint: jest.fn(),
      advanceToNextBackendEndpoint: jest.fn(),
      getCurrentEndpoint: jest.fn(() => ({ wsUrl: 'wss://fallback.test/ws' })),
      logMainRuntime: jest.fn(),
      log: jest.fn(),
    };

    handleBackendFallbackEvent({ [key]: value }, deps);

    expect(deps.setActiveBackendEndpoint).toHaveBeenCalledWith(1);
    expect(deps.advanceToNextBackendEndpoint).not.toHaveBeenCalled();
  });

  test('runtime reuses injected dependencies for connection and fallback events', () => {
    const deps = {
      ...createConnectionDeps(),
      getEndpointCandidates: jest.fn(() => [
        { wsUrl: 'wss://primary.test/ws', httpUrl: 'https://primary.test' },
        { wsUrl: 'wss://fallback.test/ws', httpUrl: 'https://fallback.test' },
      ]),
      setActiveBackendEndpoint: jest.fn(),
      advanceToNextBackendEndpoint: jest.fn(),
      getCurrentEndpoint: jest.fn(() => ({ wsUrl: 'wss://fallback.test/ws' })),
    };
    const runtime = createAgentConnectionEventsRuntime(deps);

    runtime.handleConnection({
      type: 'open',
      handshake: { user_id: 'server-user' },
    });
    runtime.handleBackendFallback({
      httpUrl: 'https://fallback.test',
    });

    expect(deps.setCurrentServerUserId).toHaveBeenCalledWith('server-user');
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(true);
    expect(deps.setActiveBackendEndpoint).toHaveBeenCalledWith(1);
    expect(deps.log).toHaveBeenCalledWith(
      'Primary backend unavailable. Falling back to wss://fallback.test/ws.',
    );
  });

  test('ipc.cjs delegates connection event and fallback bodies to the helper runtime', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_connection_events.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentConnectionEventsRuntime({');
    expect(mainSource).toContain('agentConnectionEventsRuntime.handleConnection(event)');
    expect(mainSource).toContain(
      'agentConnectionEventsRuntime.handleBackendFallback(endpointPayload)',
    );
    expect(mainSource).not.toContain('handleAgentConnectionEvent(event');
    expect(mainSource).not.toContain('handleAgentBackendFallbackEvent(endpointPayload');
    expect(mainSource).not.toContain("event.type === 'open'");
    expect(mainSource).not.toContain("candidate.wsUrl === endpointPayload.wsUrl");
    expect(helperSource).toContain('createAgentConnectionEventsRuntime');
    const connectionEventsModule = require('../../src/main/ipc/ipc_agent_connection_events.cjs');
    expect(connectionEventsModule.handleAgentConnectionEvent).toBeUndefined();
    expect(connectionEventsModule.handleAgentBackendFallbackEvent).toBeUndefined();
    expect(helperSource).toContain("event.type === 'open'");
    expect(helperSource).toContain("candidate.wsUrl === endpointPayload.wsUrl");
  });
});
