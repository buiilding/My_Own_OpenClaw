import {
  applyConfigIfChanged,
  mergeFrontendProviderConfig,
  sanitizeFrontendProviderConfig,
} from '../../frontend/src/renderer/app/providers/appConfigPersistence';

describe('appConfigPersistence', () => {
  test('sanitizes config by stripping undefined fields', () => {
    expect(
      sanitizeFrontendProviderConfig({
        voice_mode_enabled: true,
        speech_mode_enabled: undefined,
        selected_model_id: 'model-a',
      }),
    ).toEqual({
      voice_mode_enabled: true,
      selected_model_id: 'model-a',
    });
  });

  test('applies config when shallow changes exist', () => {
    const configRef = { current: { voice_mode_enabled: false, selected_model_id: 'model-a' } };
    const setConfig = jest.fn();

    const didApply = applyConfigIfChanged(
      { voice_mode_enabled: false, selected_model_id: 'model-b' },
      configRef,
      setConfig,
    );

    expect(didApply).toBe(true);
    expect(configRef.current).toEqual({
      voice_mode_enabled: false,
      selected_model_id: 'model-b',
    });
    expect(setConfig).toHaveBeenCalledWith({
      voice_mode_enabled: false,
      selected_model_id: 'model-b',
    });
  });

  test('does not apply config when no shallow changes exist', () => {
    const configRef = { current: { voice_mode_enabled: false, selected_model_id: 'model-a' } };
    const setConfig = jest.fn();

    const didApply = applyConfigIfChanged(
      { voice_mode_enabled: false, selected_model_id: 'model-a' },
      configRef,
      setConfig,
    );

    expect(didApply).toBe(false);
    expect(setConfig).not.toHaveBeenCalled();
  });

  test('does not apply empty config objects', () => {
    const configRef = { current: { voice_mode_enabled: false } };
    const setConfig = jest.fn();

    expect(applyConfigIfChanged({}, configRef, setConfig)).toBe(false);
    expect(setConfig).not.toHaveBeenCalled();
  });

  test('sanitizeFrontendProviderConfig does not mutate input object', () => {
    const input = {
      voice_mode_enabled: true,
      model_provider: 'openai',
    };

    const output = sanitizeFrontendProviderConfig(input);
    expect(output).toEqual({
      voice_mode_enabled: true,
      model_provider: 'openai',
    });
    expect(input).toEqual({
      voice_mode_enabled: true,
      model_provider: 'openai',
    });
  });

  test('does not apply nullish config payloads', () => {
    const configRef = { current: { voice_mode_enabled: false } };
    const setConfig = jest.fn();

    expect(applyConfigIfChanged(null, configRef, setConfig)).toBe(false);
    expect(applyConfigIfChanged(undefined, configRef, setConfig)).toBe(false);
    expect(setConfig).not.toHaveBeenCalled();
  });

  test('mergeFrontendProviderConfig preserves base fields and applies patch fields', () => {
    expect(
      mergeFrontendProviderConfig(
        { model_mode: 'online', voice_mode_enabled: false },
        { voice_mode_enabled: true },
      ),
    ).toEqual({
      model_mode: 'online',
      voice_mode_enabled: true,
    });
  });
});
