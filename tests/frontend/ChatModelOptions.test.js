import {
  buildChatModelOptions,
  buildChatProviderOptions,
  formatProviderLabel,
  getAvailableModelPool,
  resolveProviderModels,
  resolveSelectedModelOption,
} from '../../frontend/src/renderer/features/chat/utils/chatModelOptions';

describe('chatModelOptions', () => {
  test('formats known and hyphenated providers', () => {
    expect(formatProviderLabel('openai')).toBe('OpenAI');
    expect(formatProviderLabel('openrouter')).toBe('OpenRouter');
    expect(formatProviderLabel('anthropic-labs')).toBe('Anthropic-Labs');
  });

  test('selects available model pool by mode', () => {
    const availableModels = {
      local: [{ id: 'llama-3.2' }],
      online: [{ id: 'gpt-5' }],
    };
    expect(getAvailableModelPool(availableModels, 'local')).toEqual([{ id: 'llama-3.2' }]);
    expect(getAvailableModelPool(availableModels, 'online')).toEqual([{ id: 'gpt-5' }]);
  });

  test('builds model options with provider filtering and selected runtime priority', () => {
    const availableModelPool = [
      { id: 'gpt-5-mini', provider: 'openai', runtime_model_id: 'gpt-5-mini-runtime' },
      { id: 'gpt-5', provider: 'openai', runtime_model_id: 'gpt-5-runtime' },
      { id: 'claude-3', provider: 'anthropic', runtime_model_id: 'claude-3-runtime' },
    ];

    const options = buildChatModelOptions({
      availableModelPool,
      configuredProvider: 'openai',
      configuredModelId: 'gpt-5-runtime',
    });

    expect(options).toHaveLength(2);
    expect(options[0]?.id).toBe('gpt-5');
    expect(options[1]?.id).toBe('gpt-5-mini');
  });

  test('injects configured model when unavailable in current pool', () => {
    const options = buildChatModelOptions({
      availableModelPool: [{ id: 'gpt-5-mini', provider: 'openai' }],
      configuredProvider: 'openai',
      configuredModelId: 'gpt-5',
    });

    expect(options[0]).toMatchObject({
      id: 'gpt-5',
      provider: 'openai',
      label: 'gpt-5',
      supportsThinking: false,
    });
  });

  test('builds sorted provider options and includes missing configured provider', () => {
    const options = buildChatProviderOptions({
      availableModelPool: [
        { provider: 'openrouter' },
        { provider: 'openai' },
      ],
      configuredProvider: 'anthropic',
    });

    expect(options).toEqual(['anthropic', 'openai', 'openrouter']);
  });

  test('resolves provider-specific models and selected option fallback', () => {
    const pool = [
      { id: 'gpt-5', provider: 'openai' },
      { id: 'claude-3', provider: 'anthropic' },
    ];
    expect(resolveProviderModels(pool, 'openai')).toEqual([{ id: 'gpt-5', provider: 'openai' }]);

    const modelOptions = [
      { id: 'gpt-5-mini', runtimeModelId: 'gpt-5-mini-runtime' },
      { id: 'gpt-5', runtimeModelId: 'gpt-5-runtime' },
    ];
    expect(resolveSelectedModelOption(modelOptions, 'gpt-5-runtime')).toEqual(modelOptions[1]);
    expect(resolveSelectedModelOption(modelOptions, 'missing')).toEqual(modelOptions[0]);
  });
});
