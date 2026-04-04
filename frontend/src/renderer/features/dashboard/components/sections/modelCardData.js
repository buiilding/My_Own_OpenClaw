const MODEL_CARD_FALLBACKS = {
  'gpt-5.4': {
    description: "OpenAI's GPT-5.4 reasoning model with configurable effort from none through xhigh.",
    context: 400000,
    latency: '~1.4s',
    strengths: ['Reasoning', 'Code', 'Agents', 'Tools'],
  },
  'claude-sonnet-4-5-20250929': {
    description: "Anthropic's Claude Sonnet 4.5 balances strong coding, reasoning, and agent reliability.",
    context: 200000,
    latency: '~1.3s',
    strengths: ['Agents', 'Coding', 'Writing', 'Reliable'],
  },
  'claude-opus-4-6': {
    description: "Anthropic's most capable Claude 4.6 model for difficult coding, analysis, and long-context work.",
    context: 1000000,
    latency: '~2.2s',
    strengths: ['Deep Reasoning', 'Coding', 'Long Context', 'Agents'],
  },
  'claude-haiku-4-5-20251001': {
    description: "Anthropic's fastest Claude 4.5 family model for responsive assistants and lightweight agent tasks.",
    context: 200000,
    latency: '~0.9s',
    strengths: ['Fast', 'Efficiency', 'Agents', 'Writing'],
  },
  'claude-sonnet-4-6': {
    description: 'Claude Sonnet 4.6 pairs frontier reasoning with 1M-token context for serious agent workflows.',
    context: 1000000,
    latency: '~1.4s',
    strengths: ['Long Context', 'Agents', 'Coding', 'Balanced'],
  },
  'claude-opus-4-5': {
    description: 'Claude Opus 4.5 prioritizes maximum capability for demanding coding and reasoning tasks.',
    context: 200000,
    latency: '~2.1s',
    strengths: ['Deep Reasoning', 'Coding', 'Analysis', 'Vision'],
  },
  'claude-haiku-4-5': {
    description: 'Claude Haiku 4.5 emphasizes speed and efficiency while keeping the Claude 4.5 tool-use stack.',
    context: 200000,
    latency: '~0.9s',
    strengths: ['Fast', 'Efficiency', 'Agents', 'Vision'],
  },
  'claude-sonnet-4-5': {
    description: "Claude Sonnet 4.5 is Anthropic's balanced model for coding, reasoning, and agent execution.",
    context: 200000,
    latency: '~1.3s',
    strengths: ['Coding', 'Reasoning', 'Agents', 'Writing'],
  },
  'claude-sonnet-4-20250514': {
    description: 'Claude Sonnet 4 offers strong everyday coding and analysis with dependable tool use.',
    context: 200000,
    latency: '~1.3s',
    strengths: ['Coding', 'Reasoning', 'Agents', 'Balanced'],
  },
  'gemini-2.5-flash': {
    description: 'Faster than Gemini 2.5 Pro and cheaper to run, while keeping 1M-token context for everyday multimodal chat and coding.',
    context: 1048576,
    latency: '~1.0s',
    strengths: ['Fast', 'Multimodal', 'Search', '1M Context'],
  },
  'gemini-2.5-pro': {
    description: 'More capable than Gemini 2.5 Flash for harder reasoning, code, and STEM work, with the same 1M-token context.',
    context: 1048576,
    latency: '~1.8s',
    strengths: ['Reasoning', 'Code', 'Multimodal', '1M Context'],
  },
  'gemini-3-pro-preview': {
    description: 'More capable than Gemini 3 Flash for deeper reasoning, planning, and agent workflows, with 1M-token context.',
    context: 1048576,
    latency: '~1.8s',
    strengths: ['Reasoning', 'Multimodal', 'Agents', '1M Context'],
  },
  'gemini-3-flash-preview': {
    description: 'Faster than Gemini 3 Pro for responsive multimodal tasks and coding, while keeping 1M-token context.',
    context: 1048576,
    latency: '~1.0s',
    strengths: ['Fast', 'Multimodal', 'Code', '1M Context'],
  },
  'gemini-3.1-pro-preview': {
    description: 'A stronger Gemini 3.1 Pro preview for advanced coding, long-context reasoning, and multimodal agent work.',
    context: 1048576,
    latency: '~1.7s',
    strengths: ['Reasoning', 'Code', 'Multimodal', '1M Context'],
  },
  'openrouter/auto': {
    description: "OpenRouter's auto router picks a suitable upstream model automatically for each request.",
    context: 2000000,
    latency: '~1.4s',
    strengths: ['Auto Routing', '2M Context', 'Flexible', 'Breadth'],
  },
  'qwen/qwen3-vl-235b-a22b-thinking': {
    description: 'Qwen3 VL 235B A22B Thinking is a multimodal reasoning model exposed through OpenRouter.',
    context: 131072,
    latency: '~2.0s',
    strengths: ['Multimodal', 'Vision', 'Reasoning', 'UI Tasks'],
  },
  'mistral-large-latest': {
    description: "Mistral's flagship large model for coding, reasoning, and multimodal assistance.",
    context: 256000,
    latency: '~1.6s',
    strengths: ['Coding', 'Reasoning', 'Multimodal', '256k Context'],
  },
  'mistral-small-latest': {
    description: "Mistral's smaller general-purpose model for fast chat, instruction following, and coding support.",
    context: 128000,
    latency: '~1.0s',
    strengths: ['Fast', 'Coding', 'Efficient', '128k Context'],
  },
  k2p5: {
    description: "Moonshot's Kimi K2.5 model is built for agentic coding, multimodal reasoning, and long-context work.",
    context: 256000,
    latency: '~1.4s',
    strengths: ['Agentic', 'Coding', 'Multimodal', '256k Context'],
  },
};

function resolveRuntimeModelKey(model) {
  const runtimeModelId = model?.runtime_model_id || model?.runtimeModelId;
  if (typeof runtimeModelId === 'string' && runtimeModelId.trim()) {
    return runtimeModelId.trim();
  }

  const rawId = model?.id;
  if (typeof rawId === 'string' && rawId.trim()) {
    const normalizedId = rawId.trim();
    const [selectedId] = normalizedId.split('@@');
    return selectedId;
  }

  return '';
}

function getFallbackModelMetadata(model) {
  const key = resolveRuntimeModelKey(model);
  return MODEL_CARD_FALLBACKS[key] || null;
}

function buildModelDescription(model) {
  if (typeof model?.description === 'string' && model.description.trim()) {
    return model.description.trim();
  }
  const fallback = getFallbackModelMetadata(model);
  if (fallback?.description) {
    return fallback.description;
  }
  const provider = (model?.provider || '').toLowerCase();
  if (provider.includes('openai')) {
    return 'Flagship multimodal model. Fast, accurate, cost-effective.';
  }
  if (provider.includes('anthropic')) {
    return 'Advanced reasoning with strong instruction following.';
  }
  if (provider.includes('google') || provider.includes('gemini')) {
    return 'Powerful model with native multimodal understanding.';
  }
  if (provider.includes('mistral')) {
    return 'General-purpose model tuned for coding, reasoning, and multilingual tasks.';
  }
  if (provider.includes('openrouter')) {
    return 'Unified router for accessing multiple upstream models through one endpoint.';
  }
  if (provider.includes('kimi')) {
    return 'Agentic coding model from Moonshot with strong long-context and multimodal support.';
  }
  if (provider.includes('ollama') || provider.includes('local')) {
    return 'Local model runtime for private on-device workflows.';
  }
  return 'General-purpose model suitable for chat, coding and reasoning tasks.';
}

function buildModelStrengths(model) {
  if (Array.isArray(model?.strengths) && model.strengths.length > 0) {
    return model.strengths.map((strength) => String(strength));
  }
  const fallback = getFallbackModelMetadata(model);
  if (Array.isArray(fallback?.strengths) && fallback.strengths.length > 0) {
    return fallback.strengths.map((strength) => String(strength));
  }
  const provider = (model?.provider || '').toLowerCase();
  if (provider.includes('openai')) {
    return ['Reasoning', 'Code', 'Vision', 'Multilingual'];
  }
  if (provider.includes('anthropic')) {
    return ['Analysis', 'Writing', 'Safety', 'Long Context'];
  }
  if (provider.includes('google') || provider.includes('gemini')) {
    return ['Multimodal', 'Search', 'Code', 'Efficiency'];
  }
  if (provider.includes('mistral')) {
    return ['Code', 'Reasoning', 'Fast', 'Multilingual'];
  }
  if (provider.includes('openrouter')) {
    return ['Routing', 'Breadth', 'Flexible', 'Context'];
  }
  if (provider.includes('kimi')) {
    return ['Agentic', 'Code', 'Multimodal', 'Long Context'];
  }
  if (provider.includes('ollama') || provider.includes('local')) {
    return ['Private', 'Offline', 'Low Latency', 'Customization'];
  }
  return ['Reasoning', 'General', 'Productivity', 'Flexible'];
}

function formatContextHint(contextHint) {
  if (typeof contextHint === 'number' && Number.isFinite(contextHint)) {
    return `${new Intl.NumberFormat('en-US').format(contextHint)} tokens`;
  }
  if (typeof contextHint === 'string' && contextHint.trim()) {
    return contextHint.trim();
  }
  return 'Context unknown';
}

export function toModelCard(model, isRecommended) {
  const fallback = getFallbackModelMetadata(model);
  const displayName = model?.display_name || model?.displayName || model?.id || 'unknown-model';
  const contextHint = model?.context_window || model?.contextWindow || model?.context || fallback?.context;
  const thinkingBadge = typeof model?.supports_thinking === 'boolean'
    ? (model.supports_thinking ? 'Thinking' : 'Non-thinking')
    : null;
  const badge = thinkingBadge || (isRecommended ? 'Recommended' : null);
  return {
    id: model?.id || 'unknown-model',
    displayName: String(displayName),
    provider: model?.provider || 'unknown',
    description: buildModelDescription(model),
    context: formatContextHint(contextHint),
    inputPrice: model?.input_price || model?.inputPrice || 'Free',
    outputPrice: model?.output_price || model?.outputPrice || 'Free',
    latency: model?.latency || fallback?.latency || '~1.5s',
    strengths: buildModelStrengths(model),
    badge,
  };
}

export function normalizeProviderLabel(provider) {
  const value = provider === undefined || provider === null ? '' : String(provider).trim();
  return value || 'Unknown provider';
}

export function toProviderCards(models, selectedModelId, selectedProvider) {
  const groups = new Map();

  models.forEach((model) => {
    const provider = normalizeProviderLabel(model?.provider);
    const currentGroup = groups.get(provider);
    if (currentGroup) {
      currentGroup.models.push(model);
      return;
    }
    groups.set(provider, {
      provider,
      models: [model],
    });
  });

  return Array.from(groups.values())
    .map((group) => ({
      provider: group.provider,
      count: group.models.length,
      hasSelectedModel: group.models.some((model) => (
        String(model?.id || '') === String(selectedModelId || '')
        && normalizeProviderLabel(model?.provider) === normalizeProviderLabel(selectedProvider)
      )),
    }))
    .sort((left, right) => {
      if (left.hasSelectedModel && !right.hasSelectedModel) {
        return -1;
      }
      if (!left.hasSelectedModel && right.hasSelectedModel) {
        return 1;
      }
      return left.provider.localeCompare(right.provider);
    });
}
