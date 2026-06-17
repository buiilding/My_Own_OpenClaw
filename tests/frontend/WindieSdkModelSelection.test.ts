/**
 * Covers Agent SDK model selection behavior in the frontend test suite.
 */

import {
  buildModelSettingsPatch,
  type AgentModelSelection,
} from '../../packages/windie-sdk-js/src/settings/modelSelection';

describe('buildModelSettingsPatch', () => {
  test('maps SDK model selection fields to backend settings keys', () => {
    const selection: AgentModelSelection = {
      modelId: ' gpt-5.4@@gpt-5-4-high-thinking ',
      modelProvider: ' openai ',
      modelMode: ' high ',
      interactionMode: ' agent ',
    };
    expect(buildModelSettingsPatch(selection)).toEqual({
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
      model_mode: 'high',
      interaction_mode: 'agent',
    });
  });

  test('omits blank optional fields', () => {
    expect(buildModelSettingsPatch({
      modelId: 'claude-sonnet-4-20250514',
      modelProvider: 'anthropic',
      modelMode: ' ',
      interactionMode: '',
    })).toEqual({
      selected_model_id: 'claude-sonnet-4-20250514',
      model_provider: 'anthropic',
    });
  });

  test('requires non-empty model id and provider values with owner-specific errors', () => {
    expect(() => buildModelSettingsPatch({
      modelId: ' ',
      modelProvider: 'openai',
    }, 'TestOwner')).toThrow('TestOwner requires a non-empty modelId');

    expect(() => buildModelSettingsPatch({
      modelId: 'gpt-5.4',
      modelProvider: ' ',
    }, 'TestOwner')).toThrow('TestOwner requires a non-empty modelProvider');
  });

  test('rejects the removed provider field alias', () => {
    expect(() => buildModelSettingsPatch({
      modelId: 'claude-sonnet-4-20250514',
      // @ts-expect-error provider was a compatibility spelling; modelProvider owns the SDK contract.
      provider: 'anthropic',
    }, 'TestOwner')).toThrow('TestOwner requires a non-empty modelProvider');
  });
});
