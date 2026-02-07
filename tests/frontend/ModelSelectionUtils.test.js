import {
  buildModelConfigUpdate,
  evaluateModelSelection,
  filterModelsBySearch,
  getCurrentModels,
  getFallbackModelSelection,
} from '../../frontend/src/renderer/features/dashboard/utils/modelSelectionUtils';

describe('modelSelectionUtils', () => {
  const sampleModels = [
    { id: 'gpt-5', provider: 'openai' },
    { id: 'claude-sonnet', provider: 'anthropic' },
  ];

  test('getCurrentModels returns local models for local mode', () => {
    expect(getCurrentModels({ local: sampleModels, online: [] }, 'local')).toEqual(sampleModels);
  });

  test('getCurrentModels returns online models by default', () => {
    expect(getCurrentModels({ local: [], online: sampleModels }, 'online')).toEqual(sampleModels);
    expect(getCurrentModels(undefined, 'online')).toEqual([]);
  });

  test('filterModelsBySearch returns all models when query is empty', () => {
    expect(filterModelsBySearch(sampleModels, '  ')).toEqual(sampleModels);
  });

  test('filterModelsBySearch matches id and provider case-insensitively', () => {
    expect(filterModelsBySearch(sampleModels, 'GPT')).toEqual([{ id: 'gpt-5', provider: 'openai' }]);
    expect(filterModelsBySearch(sampleModels, 'THROPIC')).toEqual([{ id: 'claude-sonnet', provider: 'anthropic' }]);
  });

  test('buildModelConfigUpdate maps selected model and app mode values', () => {
    expect(
      buildModelConfigUpdate({
        modelMode: 'local',
        selectedModel: { id: 'qwen2.5', provider: 'ollama' },
        speechModeEnabled: true,
        interactionMode: 'chat',
      }),
    ).toEqual({
      model_mode: 'local',
      selected_model_id: 'qwen2.5',
      model_provider: 'ollama',
      speech_mode_enabled: true,
      interaction_mode: 'chat',
    });
  });

  test('buildModelConfigUpdate defaults selected model fields to empty strings', () => {
    expect(
      buildModelConfigUpdate({
        modelMode: 'online',
        selectedModel: null,
        speechModeEnabled: false,
        interactionMode: 'voice',
      }),
    ).toEqual({
      model_mode: 'online',
      selected_model_id: '',
      model_provider: '',
      speech_mode_enabled: false,
      interaction_mode: 'voice',
    });
  });

  test('evaluateModelSelection returns empty status without selected id', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: '',
        selectedProvider: '',
        currentModels: sampleModels,
      }),
    ).toEqual({ status: 'empty' });
  });

  test('evaluateModelSelection returns missing status and warning for unavailable model', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: 'missing-model',
        selectedProvider: 'openai',
        currentModels: sampleModels,
      }),
    ).toEqual({
      status: 'missing',
      warning: 'Selected model "missing-model" is not available. Resetting to default.',
    });
  });

  test('evaluateModelSelection returns provider-mismatch for id match with wrong provider', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: 'gpt-5',
        selectedProvider: 'other',
        currentModels: sampleModels,
      }),
    ).toEqual({
      status: 'provider-mismatch',
      model: { id: 'gpt-5', provider: 'openai' },
    });
  });

  test('evaluateModelSelection returns valid state when id/provider match', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: 'gpt-5',
        selectedProvider: 'openai',
        currentModels: sampleModels,
      }),
    ).toEqual({
      status: 'valid',
      model: { id: 'gpt-5', provider: 'openai' },
    });
  });

  test('getFallbackModelSelection returns first model or empty selection', () => {
    expect(getFallbackModelSelection(sampleModels)).toEqual({ id: 'gpt-5', provider: 'openai' });
    expect(getFallbackModelSelection([])).toEqual({ id: '', provider: '' });
  });
});
