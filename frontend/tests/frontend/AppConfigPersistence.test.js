/**
 * Covers app config persistence. behavior in the frontend test suite.
 */

import {
  applyConfigIfChanged,
  buildMergedRendererConfig,
  buildRendererConfigPersistencePayload,
  buildRendererConfigStoragePayload,
  mergeRendererProviderConfig,
  sanitizeRendererProviderConfig,
} from '../../src/renderer/app/providers/appConfigPersistence';

describe('appConfigPersistence', () => {
  test('sanitizes config by stripping undefined fields', () => {
    expect(
      sanitizeRendererProviderConfig({
        speech_mode_enabled: true,
        include_query_screenshot: undefined,
        selected_model_id: 'model-a',
        backend_only_state: 'drop-me',
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

  test('sanitizeRendererProviderConfig does not mutate input object', () => {
    const input = {
      speech_mode_enabled: true,
      model_provider: 'openai',
    };

    const output = sanitizeRendererProviderConfig(input);
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

  test('mergeRendererProviderConfig preserves base fields and applies patch fields', () => {
    expect(
      mergeRendererProviderConfig(
        { model_mode: 'online', speech_mode_enabled: false },
        { speech_mode_enabled: true },
      ),
    ).toEqual({
      model_mode: 'online',
      speech_mode_enabled: true,
    });
  });

  test('mergeRendererProviderConfig deep-merges provider_api_keys entries', () => {
    expect(
      mergeRendererProviderConfig(
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

  test('sanitizeRendererProviderConfig strips undefined provider_api_keys fields', () => {
    expect(
      sanitizeRendererProviderConfig({
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

  test('mergeRendererProviderConfig drops unknown config fields through the renderer allowlist', () => {
    expect(
      mergeRendererProviderConfig(
        {
          backend_only_state: { token: 'base-token' },
        },
        {
          local_runtime_only_state: { token: 'patch-token' },
        },
      ),
    ).toEqual({});
  });

  test('buildMergedRendererConfig owns final sanitize and merge behavior', () => {
    expect(
      buildMergedRendererConfig(
        {
          provider_api_keys: {
            openai: { enabled: true, api_key: 'sk-base' },
            anthropic: { enabled: true, api_key: 'anth-base' },
          },
          backend_only_state: 'drop-me',
        },
        {
          provider_api_keys: {
            openai: { api_key: 'sk-updated', extra: undefined },
          },
          speech_mode_enabled: true,
        },
      ),
    ).toEqual({
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-updated' },
        anthropic: { enabled: true, api_key: 'anth-base' },
      },
      speech_mode_enabled: true,
    });
  });

  test('buildRendererConfigPersistencePayload keeps provider secrets for main encrypted persistence and drops unknown fields', () => {
    expect(
      buildRendererConfigPersistencePayload({
        provider_api_keys: {
          openai: { enabled: true, api_key: 'sk-openai' },
        },
        backend_only_state: {
          access_token: 'access-token',
        },
      }),
    ).toEqual({
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-openai' },
      },
    });
  });

  test('buildRendererConfigStoragePayload redacts provider secrets for localStorage', () => {
    expect(
      buildRendererConfigStoragePayload({
        provider_api_keys: {
          openai: { enabled: true, api_key: 'sk-openai' },
        },
        backend_only_state: {
          access_token: 'access-token',
        },
      }),
    ).toEqual({
      provider_api_keys: {
        openai: { enabled: true, api_key: '', has_saved_key: true },
        anthropic: { enabled: false, api_key: '', has_saved_key: false },
        google: { enabled: false, api_key: '', has_saved_key: false },
        openrouter: { enabled: false, api_key: '', has_saved_key: false },
        mistral: { enabled: false, api_key: '', has_saved_key: false },
        kimi_coding: { enabled: false, api_key: '', has_saved_key: false },
      },
    });
  });
});
