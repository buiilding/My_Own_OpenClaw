/** @jest-environment node */

const {
  normalizeSdkRuntimeCommand,
  shouldConnectForSdkRuntimeCommand,
  shouldLogRendererSdkRuntimeCommand,
  shouldQueueUntilConnected,
  shouldSyncSettingsBeforeSdkRuntimeCommand,
  sendSdkRuntimeCommand,
} = require('../../frontend/src/main/ipc/ipc_sdk_command_router.cjs');

describe('ipc sdk command router', () => {
  test('normalizes renderer backend commands without sharing payload references', () => {
    const payload = { text: 'hello' };
    const normalized = normalizeSdkRuntimeCommand({ type: 'query', payload });

    expect(normalized).toEqual({ type: 'query', payload: { text: 'hello' } });
    expect(normalized.payload).not.toBe(payload);
  });

  test('rejects malformed command types and non-object payloads', () => {
    expect(normalizeSdkRuntimeCommand({ payload: ['bad'] })).toEqual({
      type: null,
      payload: {},
    });
    expect(normalizeSdkRuntimeCommand({ type: 123, payload: 'bad' })).toEqual({
      type: null,
      payload: {},
    });
  });

  test('keeps websocket connection policy in the sdk command boundary', () => {
    expect(shouldConnectForSdkRuntimeCommand('query')).toBe(true);
    expect(shouldConnectForSdkRuntimeCommand('wakeword-detected')).toBe(true);
    expect(shouldConnectForSdkRuntimeCommand('compact-history')).toBe(true);
    expect(shouldConnectForSdkRuntimeCommand('rehydrate-conversation')).toBe(true);
    expect(shouldConnectForSdkRuntimeCommand('load-settings')).toBe(true);
    expect(shouldConnectForSdkRuntimeCommand('list-models')).toBe(false);
    expect(shouldConnectForSdkRuntimeCommand('update-settings')).toBe(false);
  });

  test('keeps settings sync policy scoped to loop-starting commands', () => {
    expect(shouldSyncSettingsBeforeSdkRuntimeCommand('query')).toBe(true);
    expect(shouldSyncSettingsBeforeSdkRuntimeCommand('wakeword-detected')).toBe(true);
    expect(shouldSyncSettingsBeforeSdkRuntimeCommand('compact-history')).toBe(false);
    expect(shouldSyncSettingsBeforeSdkRuntimeCommand('list-models')).toBe(false);
  });

  test('identifies queued and logged renderer commands', () => {
    expect(shouldQueueUntilConnected('list-models')).toBe(true);
    expect(shouldQueueUntilConnected('query')).toBe(false);
    expect(shouldLogRendererSdkRuntimeCommand('query')).toBe(true);
    expect(shouldLogRendererSdkRuntimeCommand('wakeword-detected')).toBe(true);
    expect(shouldLogRendererSdkRuntimeCommand('load-settings')).toBe(false);
  });

  test('dispatches query and wakeword through typed sdk runtime methods', () => {
    const runtime = {
      sendBackendMessage: jest.fn(() => 'backend-id'),
      sendListModels: jest.fn(() => 'models-id'),
      sendQuery: jest.fn(() => 'query-id'),
      sendStopQuery: jest.fn(() => 'stop-id'),
      sendUpdateSettings: jest.fn(() => 'settings-id'),
      sendWakewordDetected: jest.fn(() => 'wakeword-id'),
    };

    expect(sendSdkRuntimeCommand(runtime, {
      type: 'query',
      payload: { text: 'run' },
      messageId: 'msg-query',
    })).toBe('query-id');
    expect(sendSdkRuntimeCommand(runtime, {
      type: 'wakeword-detected',
      payload: { source: 'mic' },
      messageId: 'msg-wake',
    })).toBe('wakeword-id');
    expect(sendSdkRuntimeCommand(runtime, {
      type: 'stop-query',
      payload: { conversation_ref: 'conv-stop' },
      messageId: 'msg-stop',
    })).toBe('stop-id');
    expect(sendSdkRuntimeCommand(runtime, {
      type: 'update-settings',
      payload: { provider: 'openai' },
      messageId: 'msg-settings',
    })).toBe('settings-id');
    expect(sendSdkRuntimeCommand(runtime, {
      type: 'list-models',
      payload: {},
      messageId: 'msg-models',
    })).toBe('models-id');
    expect(sendSdkRuntimeCommand(runtime, {
      type: 'compact-history',
      payload: { conversation_ref: 'conv-1' },
      messageId: 'msg-compact',
    })).toBe('backend-id');

    expect(runtime.sendQuery).toHaveBeenCalledWith({ text: 'run' }, 'msg-query');
    expect(runtime.sendWakewordDetected).toHaveBeenCalledWith({ source: 'mic' }, 'msg-wake');
    expect(runtime.sendStopQuery).toHaveBeenCalledWith(
      { conversation_ref: 'conv-stop' },
      'msg-stop',
    );
    expect(runtime.sendUpdateSettings).toHaveBeenCalledWith({ provider: 'openai' }, 'msg-settings');
    expect(runtime.sendListModels).toHaveBeenCalledWith({}, 'msg-models');
    expect(runtime.sendBackendMessage).toHaveBeenCalledWith(
      'compact-history',
      { conversation_ref: 'conv-1' },
      'msg-compact',
    );
  });
});
