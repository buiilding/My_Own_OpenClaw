/**
 * Provides the model card data module for the renderer UI.
 */

function buildModelDescription(model) {
  if (typeof model?.description === 'string' && model.description.trim()) {
    return model.description.trim();
  }
  const provider = (model?.provider || '').toLowerCase();
  if (provider.includes('openai')) {
    return 'OpenAI flagship model family for chat, coding, and agent workflows.';
  }
  if (provider.includes('anthropic')) {
    return 'Advanced reasoning with strong instruction following.';
  }
  if (provider.includes('google') || provider.includes('gemini')) {
    return 'Powerful model family with native multimodal understanding.';
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
  const displayName = model?.display_name || model?.displayName || model?.id || 'unknown-model';
  const contextHint = model?.context_window || model?.contextWindow || model?.context;
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
    latency: model?.latency || '~1.5s',
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
        model?.id === selectedModelId && normalizeProviderLabel(selectedProvider) === group.provider
      )),
    }))
    .sort((left, right) => {
      if (left.hasSelectedModel) {
        return -1;
      }
      if (right.hasSelectedModel) {
        return 1;
      }
      return left.provider.localeCompare(right.provider);
    });
}
