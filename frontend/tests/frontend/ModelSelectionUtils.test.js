/**
 * Covers model selection utils. behavior in the frontend test suite.
 */

import {
  DesktopModelSelectionRuntime,
} from '../../src/renderer/app/runtime/desktopModelSelectionRuntime';

const {
  buildModelConfigUpdate,
  clearModelResetWarningTimer,
  evaluateModelSelection,
  getCurrentModels,
  getFallbackModelSelection,
  scheduleModelResetWarningClear,
} = DesktopModelSelectionRuntime;

describe('desktopModelSelectionRuntime', () => {
  const sampleModels = [
    { id: 'gpt-5', provider: 'openai' },
    { id: 'claude-sonnet', provider: 'anthropic' },
  ];

  function createTimerApi() {
    let nextId = 0;
    const timers = new Map();
    return {
      timers,
      setTimeout(callback, delayMs) {
        const id = ++nextId;
        timers.set(id, { callback, delayMs });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    };
  }

  test('getCurrentModels returns local models for local mode', () => {
    expect(getCurrentModels({ local: sampleModels, online: [] }, 'local')).toEqual(sampleModels);
  });

  test('getCurrentModels returns online models by default', () => {
    expect(getCurrentModels({ local: [], online: sampleModels }, 'online')).toEqual(sampleModels);
    expect(getCurrentModels(undefined, 'online')).toEqual([]);
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

  test('buildModelConfigUpdate normalizes numeric ids and null providers to strings', () => {
    expect(
      buildModelConfigUpdate({
        modelMode: 'online',
        selectedModel: { id: 7, provider: null },
        speechModeEnabled: false,
        interactionMode: 'chat',
      }),
    ).toEqual({
      model_mode: 'online',
      selected_model_id: '7',
      model_provider: '',
      speech_mode_enabled: false,
      interaction_mode: 'chat',
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

  test('evaluateModelSelection treats undefined model provider as empty-string provider', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: 'model-no-provider',
        selectedProvider: '',
        currentModels: [{ id: 'model-no-provider' }],
      }),
    ).toEqual({
      status: 'valid',
      model: { id: 'model-no-provider' },
    });
  });

  test('evaluateModelSelection matches numeric model ids against string selected id', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: '123',
        selectedProvider: 'local',
        currentModels: [{ id: 123, provider: 'local' }],
      }),
    ).toEqual({
      status: 'valid',
      model: { id: 123, provider: 'local' },
    });
  });

  test('evaluateModelSelection keeps exact provider match even when other providers exist for same id', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: 'shared-model',
        selectedProvider: 'provider-b',
        currentModels: [
          { id: 'shared-model', provider: 'provider-a' },
          { id: 'shared-model', provider: 'provider-b' },
        ],
      }),
    ).toEqual({
      status: 'valid',
      model: { id: 'shared-model', provider: 'provider-b' },
    });
  });

  test('evaluateModelSelection picks deterministic canonical provider when selected provider missing', () => {
    expect(
      evaluateModelSelection({
        selectedModelId: 'shared-model',
        selectedProvider: '',
        currentModels: [
          { id: 'shared-model', provider: 'z-provider' },
          { id: 'shared-model', provider: 'a-provider' },
        ],
      }),
    ).toEqual({
      status: 'provider-mismatch',
      model: { id: 'shared-model', provider: 'a-provider' },
    });
  });

  test('getFallbackModelSelection returns first model or empty selection', () => {
    expect(getFallbackModelSelection(sampleModels)).toEqual({ id: 'gpt-5', provider: 'openai' });
    expect(getFallbackModelSelection([])).toEqual({ id: '', provider: '' });
  });

  test('model reset warning timer schedules, replaces, runs, and clears through adapter', () => {
    const timerApi = createTimerApi();
    const timerRef = { current: null };
    const firstClear = jest.fn();
    const secondClear = jest.fn();

    scheduleModelResetWarningClear({
      timerRef,
      onClear: firstClear,
      timerApi,
    });
    expect(timerRef.current).toBe(1);
    expect(timerApi.timers.get(1)?.delayMs).toBe(5000);

    scheduleModelResetWarningClear({
      timerRef,
      onClear: secondClear,
      delayMs: 1200,
      timerApi,
    });
    expect(timerApi.timers.has(1)).toBe(false);
    expect(timerRef.current).toBe(2);
    expect(timerApi.timers.get(2)?.delayMs).toBe(1200);

    timerApi.timers.get(2)?.callback();
    expect(timerRef.current).toBeNull();
    expect(firstClear).not.toHaveBeenCalled();
    expect(secondClear).toHaveBeenCalledTimes(1);

    scheduleModelResetWarningClear({
      timerRef,
      onClear: firstClear,
      timerApi,
    });
    clearModelResetWarningTimer({ timerRef, timerApi });
    expect(timerRef.current).toBeNull();
    expect(timerApi.timers.has(3)).toBe(false);
  });

  test('model reset warning timer clears immediately when timer adapter is unavailable', () => {
    const timerRef = { current: null };
    const onClear = jest.fn();

    const timerId = scheduleModelResetWarningClear({
      timerRef,
      onClear,
      timerApi: {},
    });

    expect(timerId).toBeNull();
    expect(timerRef.current).toBeNull();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
