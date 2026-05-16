import {
  buildDeferredQueryModelConfig,
  buildDeferredQueryModelSelection,
  buildImmediateBackendConfig,
  hasImmediateBackendConfigChanges,
} from '../../frontend/src/renderer/app/providers/appConfigBackendSync';

describe('appConfigBackendSync', () => {
  test('builds deferred model updates through the SDK model settings contract', () => {
    expect(buildDeferredQueryModelConfig({
      selected_model_id: ' gpt-5.4@@gpt-5-4-none-thinking ',
      model_provider: ' openai ',
      speech_mode_enabled: true,
    })).toEqual({
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      model_provider: 'openai',
    });
  });

  test('does not send partial model selection patches', () => {
    expect(buildDeferredQueryModelConfig({
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
    })).toBeNull();
    expect(buildDeferredQueryModelConfig({
      model_provider: 'openai',
    })).toBeNull();
  });

  test('builds deferred model selection for SDK setModel callers', () => {
    expect(buildDeferredQueryModelSelection({
      selected_model_id: ' claude-sonnet-4-5 ',
      model_provider: ' anthropic ',
    })).toEqual({
      modelId: 'claude-sonnet-4-5',
      modelProvider: 'anthropic',
    });
  });

  test('keeps model selection out of immediate settings sync', () => {
    expect(buildImmediateBackendConfig({
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      model_provider: 'openai',
      speech_mode_enabled: true,
    })).toEqual({
      speech_mode_enabled: true,
    });

    expect(hasImmediateBackendConfigChanges(
      {
        selected_model_id: 'old-model',
        model_provider: 'openai',
        speech_mode_enabled: true,
      },
      {
        selected_model_id: 'new-model',
        model_provider: 'anthropic',
        speech_mode_enabled: true,
      },
    )).toBe(false);
  });
});
