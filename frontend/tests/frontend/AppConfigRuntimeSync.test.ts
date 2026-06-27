/**
 * Covers app config runtime sync behavior in the frontend test suite.
 */

import {
  buildImmediateRuntimeConfig,
  hasImmediateRuntimeConfigChanges,
} from '../../src/renderer/app/providers/appConfigRuntimeSync';
import { DesktopRendererConfigRuntimeClient } from '../../src/renderer/app/runtime/desktopRendererConfigRuntimeClient';

describe('appConfigRuntimeSync', () => {
  test('builds deferred model selection for SDK setModel callers', () => {
    expect(DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection({
      selected_model_id: ' claude-sonnet-4-5 ',
      model_provider: ' anthropic ',
    })).toEqual({
      modelId: 'claude-sonnet-4-5',
      modelProvider: 'anthropic',
    });
  });

  test('does not build partial model selections', () => {
    expect(DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection({
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
    })).toBeNull();
    expect(DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection({
      model_provider: 'openai',
    })).toBeNull();
  });

  test('keeps model selection out of immediate settings sync', () => {
    expect(buildImmediateRuntimeConfig({
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      model_provider: 'openai',
      speech_mode_enabled: true,
    })).toEqual({
      speech_mode_enabled: true,
    });

    expect(hasImmediateRuntimeConfigChanges(
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
