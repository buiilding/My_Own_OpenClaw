/**
 * Covers config filter. behavior in the frontend test suite.
 */

import {
  DesktopRendererConfigFilterRuntime,
} from '../../src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js';

const {
  filterRendererConfig,
} = DesktopRendererConfigFilterRuntime;

describe('configFilter', () => {
  test('filterRendererConfig keeps only allowed fields', () => {
    const filtered = filterRendererConfig({
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      speech_mode_enabled: true,
      wakeword_enabled: false,
      wakeword_stt_enabled: true,
      show_tool_logs: true,
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
      browser_automation_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      include_query_screenshot: false,
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-test' },
      },
      backend_only_state: {
        access_token: 'token',
      },
      appearance_mode: 'system',
      appearance_theme: {
        dark: { accent: '#339CFF' },
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
      show_tool_logs: true,
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
      browser_automation_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      include_query_screenshot: false,
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-test' },
      },
      appearance_mode: 'system',
      appearance_theme: {
        dark: { accent: '#339CFF' },
      },
    });
  });

  test('filterRendererConfig returns empty object on invalid input', () => {
    expect(filterRendererConfig(null)).toEqual({});
    expect(filterRendererConfig('nope')).toEqual({});
    expect(filterRendererConfig([])).toEqual({});
  });

  test('filterRendererConfig keeps interaction_mode', () => {
    const filtered = filterRendererConfig({
      interaction_mode: 'voice',
      extra: 'ignore',
    });
    expect(filtered).toEqual({
      interaction_mode: 'voice',
    });
  });

  test('filterRendererConfig drops backend-owned speech provider selection', () => {
    const filtered = filterRendererConfig({
      speech_provider: 'elevenlabs',
      speech_mode_enabled: true,
    });

    expect(filtered).toEqual({
      speech_mode_enabled: true,
    });
  });
});
