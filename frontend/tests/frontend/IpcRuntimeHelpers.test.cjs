/**
 * Covers Electron main IPC runtime helper behavior.
 */

const {
  SCRIPTED_PROVIDER_MODEL,
  isScriptedProviderDevModelEnabled,
  processBackendMessageData,
  withScriptedDevModel,
} = require('../../src/main/ipc/ipc_runtime_helpers.cjs');
const {
  configureDebugEnvRuntime,
} = require('../../src/main/app/debug_env.cjs');

const sampleDebugConfig = Object.freeze({
  env: Object.freeze({
    scriptedProvider: 'SAMPLE_ENABLE_SCRIPTED_PROVIDER',
  }),
});

describe('ipc_runtime_helpers scripted provider augmentation', () => {
  afterEach(() => {
    configureDebugEnvRuntime();
  });

  test('detects the scripted provider dev flag exactly', () => {
    expect(isScriptedProviderDevModelEnabled({ AGENT_ENABLE_SCRIPTED_PROVIDER: '1' })).toBe(true);
    expect(isScriptedProviderDevModelEnabled({ AGENT_ENABLE_SCRIPTED_PROVIDER: 'true' })).toBe(false);
    expect(isScriptedProviderDevModelEnabled({ SAMPLE_ENABLE_SCRIPTED_PROVIDER: '1' })).toBe(false);
    configureDebugEnvRuntime(sampleDebugConfig);
    expect(isScriptedProviderDevModelEnabled({ SAMPLE_ENABLE_SCRIPTED_PROVIDER: '1' })).toBe(true);
    expect(isScriptedProviderDevModelEnabled({})).toBe(false);
  });

  test('adds scripted model to models-listed payload only when dev flag is enabled', () => {
    const event = {
      type: 'models-listed',
      payload: {
        local: [],
        online: [{ id: 'gpt', provider: 'openai' }],
      },
    };

    expect(withScriptedDevModel(event, {})).toBe(event);
    expect(withScriptedDevModel(event, { AGENT_ENABLE_SCRIPTED_PROVIDER: '1' })).toEqual({
      type: 'models-listed',
      payload: {
        local: [],
        online: [
          { id: 'gpt', provider: 'openai' },
          SCRIPTED_PROVIDER_MODEL,
        ],
      },
    });
  });

  test('does not duplicate scripted model when backend already listed it', () => {
    const event = {
      type: 'models-listed',
      payload: {
        local: [],
        online: [SCRIPTED_PROVIDER_MODEL],
      },
    };

    expect(withScriptedDevModel(event, { AGENT_ENABLE_SCRIPTED_PROVIDER: '1' })).toBe(event);
  });

  test('logs backend error events with generic agent-backend wording', () => {
    const deps = {
      setCurrentSessionId: jest.fn(),
      setCurrentServerUserId: jest.fn(),
      setCurrentConversationRef: jest.fn(),
      resolveSettingsAck: jest.fn(),
      setResponseOverlayPhase: jest.fn(),
      getResponseOverlayPhase: jest.fn(() => 'idle'),
      broadcastToRenderers: jest.fn(),
      log: jest.fn(),
    };

    processBackendMessageData({
      id: 'settings-1',
      type: 'error',
      payload: { message: 'settings failed' },
    }, deps);

    expect(deps.log).toHaveBeenCalledWith('Error from agent backend: settings failed');
    expect(deps.log).not.toHaveBeenCalledWith(expect.stringContaining('Error from backend'));
    expect(deps.resolveSettingsAck).toHaveBeenCalledWith('settings-1', false);
  });
});
