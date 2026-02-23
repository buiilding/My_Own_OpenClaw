import {
  filterFrontendConfig,
} from '../../frontend/src/renderer/utils/configFilter.js';

describe('configFilter', () => {
  test('filterFrontendConfig keeps only allowed fields', () => {
    const filtered = filterFrontendConfig({
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.1',
      voice_mode_enabled: false,
      speech_mode_enabled: true,
      include_query_screenshot: false,
      extra: 'ignore',
    });

    expect(filtered).toEqual({
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.1',
      voice_mode_enabled: false,
      speech_mode_enabled: true,
      include_query_screenshot: false,
    });
  });

  test('filterFrontendConfig returns empty object on invalid input', () => {
    expect(filterFrontendConfig(null)).toEqual({});
    expect(filterFrontendConfig('nope')).toEqual({});
    expect(filterFrontendConfig([])).toEqual({});
  });

  test('filterFrontendConfig keeps interaction_mode', () => {
    const filtered = filterFrontendConfig({
      interaction_mode: 'voice',
      extra: 'ignore',
    });
    expect(filtered).toEqual({
      interaction_mode: 'voice',
    });
  });
});
