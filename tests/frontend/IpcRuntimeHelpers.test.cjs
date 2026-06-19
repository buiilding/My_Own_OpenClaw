/**
 * Covers Electron main IPC runtime helper behavior.
 */

const {
  SCRIPTED_PROVIDER_MODEL,
  isScriptedProviderDevModelEnabled,
  withScriptedDevModel,
} = require('../../frontend/src/main/ipc/ipc_runtime_helpers.cjs');

describe('ipc_runtime_helpers scripted provider augmentation', () => {
  test('detects the scripted provider dev flag exactly', () => {
    expect(isScriptedProviderDevModelEnabled({ WINDIE_ENABLE_SCRIPTED_PROVIDER: '1' })).toBe(true);
    expect(isScriptedProviderDevModelEnabled({ WINDIE_ENABLE_SCRIPTED_PROVIDER: 'true' })).toBe(false);
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
    expect(withScriptedDevModel(event, { WINDIE_ENABLE_SCRIPTED_PROVIDER: '1' })).toEqual({
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

    expect(withScriptedDevModel(event, { WINDIE_ENABLE_SCRIPTED_PROVIDER: '1' })).toBe(event);
  });
});
