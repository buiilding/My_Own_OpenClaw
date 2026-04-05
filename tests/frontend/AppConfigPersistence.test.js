import {
  applyConfigIfChanged,
  mergeFrontendProviderConfig,
  sanitizeFrontendProviderConfig,
} from '../../frontend/src/renderer/app/providers/appConfigPersistence';

describe('appConfigPersistence', () => {
  test('sanitizes config by stripping undefined fields', () => {
    expect(
      sanitizeFrontendProviderConfig({
        speech_mode_enabled: true,
        include_query_screenshot: undefined,
        selected_model_id: 'model-a',
      }),
    ).toEqual({
      speech_mode_enabled: true,
      selected_model_id: 'model-a',
    });
  });

  test('applies config when shallow changes exist', () => {
    const configRef = { current: { speech_mode_enabled: false, selected_model_id: 'model-a' } };
    const setConfig = jest.fn();

    const didApply = applyConfigIfChanged(
      { speech_mode_enabled: false, selected_model_id: 'model-b' },
      configRef,
      setConfig,
    );

    expect(didApply).toBe(true);
    expect(configRef.current).toEqual({
      speech_mode_enabled: false,
      selected_model_id: 'model-b',
    });
    expect(setConfig).toHaveBeenCalledWith({
      speech_mode_enabled: false,
      selected_model_id: 'model-b',
    });
  });

  test('does not apply config when no shallow changes exist', () => {
    const configRef = { current: { speech_mode_enabled: false, selected_model_id: 'model-a' } };
    const setConfig = jest.fn();

    const didApply = applyConfigIfChanged(
      { speech_mode_enabled: false, selected_model_id: 'model-a' },
      configRef,
      setConfig,
    );

    expect(didApply).toBe(false);
    expect(setConfig).not.toHaveBeenCalled();
  });

  test('does not apply empty config objects', () => {
    const configRef = { current: { speech_mode_enabled: false } };
    const setConfig = jest.fn();

    expect(applyConfigIfChanged({}, configRef, setConfig)).toBe(false);
    expect(setConfig).not.toHaveBeenCalled();
  });

  test('sanitizeFrontendProviderConfig does not mutate input object', () => {
    const input = {
      speech_mode_enabled: true,
      model_provider: 'openai',
    };

    const output = sanitizeFrontendProviderConfig(input);
    expect(output).toEqual({
      speech_mode_enabled: true,
      model_provider: 'openai',
    });
    expect(input).toEqual({
      speech_mode_enabled: true,
      model_provider: 'openai',
    });
  });

  test('does not apply nullish config payloads', () => {
    const configRef = { current: { speech_mode_enabled: false } };
    const setConfig = jest.fn();

    expect(applyConfigIfChanged(null, configRef, setConfig)).toBe(false);
    expect(applyConfigIfChanged(undefined, configRef, setConfig)).toBe(false);
    expect(setConfig).not.toHaveBeenCalled();
  });

  test('mergeFrontendProviderConfig preserves base fields and applies patch fields', () => {
    expect(
      mergeFrontendProviderConfig(
        { model_mode: 'online', speech_mode_enabled: false },
        { speech_mode_enabled: true },
      ),
    ).toEqual({
      model_mode: 'online',
      speech_mode_enabled: true,
    });
  });

  test('mergeFrontendProviderConfig deep-merges provider_api_keys entries', () => {
    expect(
      mergeFrontendProviderConfig(
        {
          provider_api_keys: {
            openai: { enabled: true, api_key: 'sk-base' },
            anthropic: { enabled: true, api_key: 'anth-base' },
          },
        },
        {
          provider_api_keys: {
            openai: { api_key: 'sk-updated' },
          },
        },
      ),
    ).toEqual({
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-updated' },
        anthropic: { enabled: true, api_key: 'anth-base' },
      },
    });
  });

  test('sanitizeFrontendProviderConfig strips undefined provider_api_keys fields', () => {
    expect(
      sanitizeFrontendProviderConfig({
        provider_api_keys: {
          openai: { enabled: true, api_key: undefined },
        },
      }),
    ).toEqual({
      provider_api_keys: {
        openai: { enabled: true },
      },
    });
  });

  test('mergeFrontendProviderConfig deep-merges provider_oauth entries', () => {
    expect(
      mergeFrontendProviderConfig(
        {
          provider_oauth: {
            openai_codex: { connected: true, access_token: 'base-token', profile_id: 'openai-codex:default' },
          },
        },
        {
          provider_oauth: {
            openai_codex: { connected: false, access_token: '' },
          },
        },
      ),
    ).toEqual({
      provider_oauth: {
        openai_codex: { connected: false, access_token: '', profile_id: 'openai-codex:default' },
      },
    });
  });
});
