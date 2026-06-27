/**
 * Covers desktop chat model options runtime behavior in the frontend test suite.
 */

import {
  DesktopChatModelOptionsRuntime,
} from '../../src/renderer/app/runtime/desktopChatModelOptionsRuntime';

const {
  buildChatModelOptions,
  buildChatProviderOptions,
  formatProviderLabel,
  getAvailableModelPool,
  resolveModelIdForReasoningMode,
  resolveProviderModels,
  resolveSelectedReasoningMode,
  resolveSelectedModelOption,
} = DesktopChatModelOptionsRuntime;

describe('desktopChatModelOptionsRuntime', () => {
  test('formats known and hyphenated providers', () => {
    expect(formatProviderLabel('openai')).toBe('OpenAI');
    expect(formatProviderLabel('openrouter')).toBe('OpenRouter');
    expect(formatProviderLabel('anthropic-labs')).toBe('Anthropic-Labs');
  });

  test('selects available model pool by mode', () => {
    const availableModels = {
      local: [{ id: 'llama-3.2' }],
      online: [{ id: 'gpt-5.4@@gpt-5-4-none-thinking' }],
    };
    expect(getAvailableModelPool(availableModels, 'local')).toEqual([{ id: 'llama-3.2' }]);
    expect(getAvailableModelPool(availableModels, 'online')).toEqual([{ id: 'gpt-5.4@@gpt-5-4-none-thinking' }]);
  });

  test('builds deduplicated base model options with provider filtering and selected runtime priority', () => {
    const availableModelPool = [
      {
        id: 'gpt-5.4@@gpt-5-4-none-thinking',
        provider: 'openai',
        runtime_model_id: 'gpt-5.4',
        display_name: 'GPT-5.4 None',
        supports_thinking: true,
        reasoning_mode: 'none',
      },
      {
        id: 'gpt-5.4@@gpt-5-4-medium-thinking',
        provider: 'openai',
        runtime_model_id: 'gpt-5.4',
        display_name: 'GPT-5.4 Medium',
        supports_thinking: true,
        reasoning_mode: 'medium',
      },
      {
        id: 'gpt-5.4@@gpt-5-4-high-thinking',
        provider: 'openai',
        runtime_model_id: 'gpt-5.4',
        display_name: 'GPT-5.4 High',
        supports_thinking: true,
        reasoning_mode: 'high',
      },
      { id: 'claude-3', provider: 'anthropic', runtime_model_id: 'claude-3-runtime' },
    ];

    const options = buildChatModelOptions({
      availableModelPool,
      configuredProvider: 'openai',
      configuredModelId: 'gpt-5.4',
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.label).toBe('GPT-5.4');
    expect(options[0]?.runtimeModelId).toBe('gpt-5.4');
    expect(options[0]?.reasoningModeOptions.map((option) => option.mode)).toEqual([
      'none',
      'medium',
      'high',
    ]);
  });

  test('prefers real provider options over unavailable configured model ids', () => {
    const options = buildChatModelOptions({
      availableModelPool: [{
        id: 'gpt-5.4@@gpt-5-4-medium-thinking',
        provider: 'openai',
        runtime_model_id: 'gpt-5.4',
        display_name: 'GPT-5.4 Medium',
        supports_thinking: true,
        reasoning_mode: 'medium',
      }],
      configuredProvider: 'openai',
      configuredModelId: 'gpt-5.4@@gpt-5-4-none-thinking',
    });

    expect(options[0]).toMatchObject({
      id: 'gpt-5.4@@gpt-5-4-medium-thinking',
      provider: 'openai',
      label: 'GPT-5.4',
    });
  });

  test('injects configured model only when there are no available options', () => {
    const options = buildChatModelOptions({
      availableModelPool: [],
      configuredProvider: 'openai',
      configuredModelId: 'unavailable-model',
    });

    expect(options).toEqual([
      {
        id: 'unavailable-model',
        runtimeModelId: '',
        provider: 'openai',
        label: 'unavailable-model',
        supportsThinking: false,
        defaultModelId: 'unavailable-model',
        defaultReasoningMode: null,
        reasoningModeOptions: [],
      },
    ]);
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
      { id: 'gpt-5.4@@gpt-5-4-none-thinking', provider: 'openai' },
      { id: 'claude-3', provider: 'anthropic' },
    ];
    expect(resolveProviderModels(pool, 'openai')).toEqual([{ id: 'gpt-5.4@@gpt-5-4-none-thinking', provider: 'openai' }]);

    const modelOptions = [
      { id: 'gemini-2.5-flash', runtimeModelId: 'gemini-2.5-flash', reasoningModeOptions: [] },
      {
        id: 'gpt-5.4@@gpt-5-4-none-thinking',
        runtimeModelId: 'gpt-5.4',
        reasoningModeOptions: [
          { mode: 'none', label: 'None', modelId: 'gpt-5.4@@gpt-5-4-none-thinking' },
          { mode: 'low', label: 'Low', modelId: 'gpt-5.4@@gpt-5-4-low-thinking' },
          { mode: 'medium', label: 'Medium', modelId: 'gpt-5.4@@gpt-5-4-medium-thinking' },
          { mode: 'high', label: 'High', modelId: 'gpt-5.4@@gpt-5-4-high-thinking' },
          { mode: 'xhigh', label: 'Extra High', modelId: 'gpt-5.4@@gpt-5-4-extra-high-thinking' },
        ],
      },
    ];
    expect(resolveSelectedModelOption(modelOptions, 'gpt-5.4')).toEqual(modelOptions[1]);
    expect(resolveSelectedModelOption(modelOptions, 'missing')).toEqual(modelOptions[0]);
    expect(resolveSelectedReasoningMode(modelOptions[1], 'gpt-5.4@@gpt-5-4-high-thinking')).toBe('high');
    expect(resolveSelectedReasoningMode(modelOptions[1], 'missing')).toBe('none');
    expect(resolveModelIdForReasoningMode(modelOptions[1], 'low')).toBe('gpt-5.4@@gpt-5-4-low-thinking');
    expect(resolveModelIdForReasoningMode(modelOptions[1], 'xhigh')).toBe('gpt-5.4@@gpt-5-4-extra-high-thinking');
  });

  test('builds reasoning modes from explicit reasoning_mode metadata', () => {
    const availableModelPool = [
      {
        id: 'gemini-3-1-pro-none',
        provider: 'gemini',
        runtime_model_id: 'gemini-3.1-pro-preview',
        display_name: 'Gemini 3.1 Pro',
        supports_thinking: true,
        reasoning_mode: 'none',
      },
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
      {
        id: 'gemini-3-1-pro-xhigh',
        provider: 'gemini',
        runtime_model_id: 'gemini-3.1-pro-preview',
        display_name: 'Gemini 3.1 Pro',
        supports_thinking: true,
        reasoning_mode: 'xhigh',
      },
    ];

    const options = buildChatModelOptions({
      availableModelPool,
      configuredProvider: 'gemini',
      configuredModelId: 'gemini-3-1-pro-medium',
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.reasoningModeOptions.map((option) => option.mode)).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  test('does not infer reasoning modes from display labels when metadata is missing', () => {
    const options = buildChatModelOptions({
      availableModelPool: [
        {
          id: 'custom-openai-high',
          provider: 'openai',
          runtime_model_id: 'custom-openai',
          display_name: 'Custom OpenAI High',
          supports_thinking: true,
        },
      ],
      configuredProvider: 'openai',
      configuredModelId: 'custom-openai-high',
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: 'custom-openai-high',
      runtimeModelId: 'custom-openai',
      label: 'Custom OpenAI',
      defaultReasoningMode: null,
      reasoningModeOptions: [],
    });
    expect(resolveSelectedReasoningMode(options[0], 'custom-openai-high')).toBeNull();
  });

  test('prefers runtime family metadata and injects none mode for non-thinking defaults', () => {
    const availableModelPool = [
      {
        id: 'claude-sonnet-4-5-base',
        provider: 'anthropic',
        runtime_model_id: 'claude-sonnet-4-5-20250929',
        family_id: 'anthropic::claude-sonnet-4-5-20250929',
        family_label: 'Claude Sonnet 4.5',
        default_model_id: 'claude-sonnet-4-5-base',
        default_reasoning_mode: 'none',
        reasoning_modes: ['none', 'low', 'high'],
        display_name: 'Claude Sonnet 4.5',
        supports_thinking: false,
      },
      {
        id: 'claude-sonnet-4-5-low',
        provider: 'anthropic',
        runtime_model_id: 'claude-sonnet-4-5-20250929',
        family_id: 'anthropic::claude-sonnet-4-5-20250929',
        family_label: 'Claude Sonnet 4.5',
        default_model_id: 'claude-sonnet-4-5-base',
        default_reasoning_mode: 'none',
        reasoning_modes: ['none', 'low', 'high'],
        display_name: 'Claude Sonnet 4.5 Low',
        supports_thinking: true,
        reasoning_mode: 'low',
      },
      {
        id: 'claude-sonnet-4-5-high',
        provider: 'anthropic',
        runtime_model_id: 'claude-sonnet-4-5-20250929',
        family_id: 'anthropic::claude-sonnet-4-5-20250929',
        family_label: 'Claude Sonnet 4.5',
        default_model_id: 'claude-sonnet-4-5-base',
        default_reasoning_mode: 'none',
        reasoning_modes: ['none', 'low', 'high'],
        display_name: 'Claude Sonnet 4.5 High',
        supports_thinking: true,
        reasoning_mode: 'high',
      },
    ];

    const options = buildChatModelOptions({
      availableModelPool,
      configuredProvider: 'anthropic',
      configuredModelId: 'claude-sonnet-4-5-base',
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: 'claude-sonnet-4-5-base',
      familyId: 'anthropic::claude-sonnet-4-5-20250929',
      label: 'Claude Sonnet 4.5',
      defaultModelId: 'claude-sonnet-4-5-base',
      defaultReasoningMode: 'none',
    });
    expect(options[0]?.reasoningModeOptions).toEqual([
      { mode: 'none', label: 'None', modelId: 'claude-sonnet-4-5-base' },
      { mode: 'low', label: 'Low', modelId: 'claude-sonnet-4-5-low' },
      { mode: 'high', label: 'High', modelId: 'claude-sonnet-4-5-high' },
    ]);
    expect(resolveSelectedReasoningMode(options[0], 'claude-sonnet-4-5-base')).toBe('none');
    expect(resolveModelIdForReasoningMode(options[0], 'missing')).toBe('claude-sonnet-4-5-base');
  });
});
