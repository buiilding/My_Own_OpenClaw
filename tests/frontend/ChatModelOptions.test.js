import {
  buildChatModelOptions,
  buildChatProviderOptions,
  formatProviderLabel,
  getAvailableModelPool,
  resolveModelIdForReasoningMode,
  resolveProviderModels,
  resolveSelectedReasoningMode,
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

  test('builds deduplicated base model options with provider filtering and selected runtime priority', () => {
    const availableModelPool = [
      {
        id: 'gpt-5-3-codex-low-thinking',
        provider: 'openai',
        runtime_model_id: 'gpt-5.3-codex',
        display_name: 'GPT-5.3 Codex Low',
        supports_thinking: true,
      },
      {
        id: 'gpt-5-3-codex-thinking',
        provider: 'openai',
        runtime_model_id: 'gpt-5.3-codex',
        display_name: 'GPT-5.3 Codex',
        supports_thinking: true,
      },
      {
        id: 'gpt-5-3-codex-high-thinking',
        provider: 'openai',
        runtime_model_id: 'gpt-5.3-codex',
        display_name: 'GPT-5.3 Codex High',
        supports_thinking: true,
      },
      { id: 'gpt-5', provider: 'openai', runtime_model_id: 'gpt-5-runtime', display_name: 'GPT-5' },
      { id: 'claude-3', provider: 'anthropic', runtime_model_id: 'claude-3-runtime' },
    ];

    const options = buildChatModelOptions({
      availableModelPool,
      configuredProvider: 'openai',
      configuredModelId: 'gpt-5.3-codex',
    });

    expect(options).toHaveLength(2);
    expect(options[0]?.label).toBe('GPT-5.3 Codex');
    expect(options[0]?.runtimeModelId).toBe('gpt-5.3-codex');
    expect(options[0]?.reasoningModeOptions.map((option) => option.mode)).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(options[1]?.label).toBe('GPT-5');
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
      { id: 'gpt-5-mini', runtimeModelId: 'gpt-5-mini-runtime', reasoningModeOptions: [] },
      {
        id: 'gpt-5-thinking-medium',
        runtimeModelId: 'gpt-5-runtime',
        reasoningModeOptions: [
          { mode: 'low', label: 'Low', modelId: 'gpt-5-thinking-low' },
          { mode: 'medium', label: 'Medium', modelId: 'gpt-5-thinking-medium' },
          { mode: 'high', label: 'High', modelId: 'gpt-5-thinking-high' },
        ],
      },
    ];
    expect(resolveSelectedModelOption(modelOptions, 'gpt-5-runtime')).toEqual(modelOptions[1]);
    expect(resolveSelectedModelOption(modelOptions, 'missing')).toEqual(modelOptions[0]);
    expect(resolveSelectedReasoningMode(modelOptions[1], 'gpt-5-thinking-high')).toBe('high');
    expect(resolveSelectedReasoningMode(modelOptions[1], 'missing')).toBe('medium');
    expect(resolveModelIdForReasoningMode(modelOptions[1], 'low')).toBe('gpt-5-thinking-low');
    expect(resolveModelIdForReasoningMode(modelOptions[1], 'extra_high')).toBe('gpt-5-thinking-medium');
  });

  test('builds reasoning modes from explicit reasoning_mode metadata', () => {
    const availableModelPool = [
      {
        id: 'gemini-3-1-pro-low',
        provider: 'gemini',
        runtime_model_id: 'gemini-3.1-pro-preview',
        display_name: 'Gemini 3.1 Pro',
        supports_thinking: true,
        reasoning_mode: 'low',
      },
      {
        id: 'gemini-3-1-pro-medium',
        provider: 'gemini',
        runtime_model_id: 'gemini-3.1-pro-preview',
        display_name: 'Gemini 3.1 Pro',
        supports_thinking: true,
        reasoning_mode: 'medium',
      },
      {
        id: 'gemini-3-1-pro-high',
        provider: 'gemini',
        runtime_model_id: 'gemini-3.1-pro-preview',
        display_name: 'Gemini 3.1 Pro',
        supports_thinking: true,
        reasoning_mode: 'high',
      },
    ];

    const options = buildChatModelOptions({
      availableModelPool,
      configuredProvider: 'gemini',
      configuredModelId: 'gemini-3-1-pro-medium',
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.reasoningModeOptions.map((option) => option.mode)).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });
});
