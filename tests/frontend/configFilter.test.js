import {
  filterFrontendConfig,
  isFrontendConfigOnly,
} from '../../frontend/src/renderer/utils/configFilter.js';

describe('configFilter', () => {
  test('filterFrontendConfig keeps only allowed fields', () => {
    const filtered = filterFrontendConfig({
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.1',
      voice_mode_enabled: false,
      speech_mode_enabled: true,
      extra: 'ignore',
    });

    expect(filtered).toEqual({
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.1',
      voice_mode_enabled: false,
      speech_mode_enabled: true,
    });
  });

  test('filterFrontendConfig returns empty object on invalid input', () => {
    expect(filterFrontendConfig(null)).toEqual({});
    expect(filterFrontendConfig('nope')).toEqual({});
  });

  test('isFrontendConfigOnly validates allowed keys', () => {
    expect(
      isFrontendConfigOnly({
        model_mode: 'online',
        model_provider: 'openai',
      }),
    ).toBe(true);

    expect(
      isFrontendConfigOnly({
        model_mode: 'online',
        extra: 'nope',
      }),
    ).toBe(false);
  });
});
