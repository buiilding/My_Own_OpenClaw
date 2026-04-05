import {
  filterFrontendConfig,
} from '../../frontend/src/renderer/utils/configFilter.js';

describe('configFilter', () => {
  test('filterFrontendConfig keeps only allowed fields', () => {
    const filtered = filterFrontendConfig({
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      speech_mode_enabled: true,
      wakeword_enabled: false,
      wakeword_stt_enabled: true,
      agent_full_sudo_enabled: true,
      show_tool_logs: true,
      browser_automation_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      include_query_screenshot: false,
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-test' },
      },
      provider_oauth: {
        openai_codex: { connected: true, access_token: 'token' },
      },
      extra: 'ignore',
    });

    expect(filtered).toEqual({
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      speech_mode_enabled: true,
      wakeword_enabled: false,
      wakeword_stt_enabled: true,
      agent_full_sudo_enabled: true,
      show_tool_logs: true,
      browser_automation_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      include_query_screenshot: false,
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-test' },
      },
      provider_oauth: {
        openai_codex: { connected: true, access_token: 'token' },
      },
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

  test('filterFrontendConfig drops backend-owned speech provider selection', () => {
    const filtered = filterFrontendConfig({
      speech_provider: 'elevenlabs',
      speech_mode_enabled: true,
    });

    expect(filtered).toEqual({
      speech_mode_enabled: true,
    });
  });
});
