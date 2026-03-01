function buildModelDescription(model) {
  const provider = (model?.provider || '').toLowerCase();
  if (provider.includes('openai')) {
    return 'Flagship multimodal model. Fast, accurate, cost-effective.';
  }
  if (provider.includes('anthropic')) {
    return 'Advanced reasoning with strong instruction following.';
  }
  if (provider.includes('google')) {
    return 'Powerful model with native multimodal understanding.';
  }
  if (provider.includes('ollama') || provider.includes('local')) {
    return 'Local model runtime for private on-device workflows.';
  }
  return 'General-purpose model suitable for chat, coding and reasoning tasks.';
}

function buildModelStrengths(model) {
  const provider = (model?.provider || '').toLowerCase();
  if (provider.includes('openai')) {
    return ['Reasoning', 'Code', 'Vision', 'Multilingual'];
  }
  if (provider.includes('anthropic')) {
    return ['Analysis', 'Writing', 'Safety', 'Long Context'];
  }
  if (provider.includes('google')) {
    return ['Multimodal', 'Search', 'Code', 'Efficiency'];
  }
  if (provider.includes('ollama') || provider.includes('local')) {
    return ['Private', 'Offline', 'Low Latency', 'Customization'];
  }
  return ['Reasoning', 'General', 'Productivity', 'Flexible'];
}

export function toModelCard(model, isRecommended) {
  const displayName = model?.display_name || model?.displayName || model?.id || 'unknown-model';
  const contextHint = model?.context_window || model?.contextWindow || model?.context || 'Context unknown';
  const thinkingBadge = typeof model?.supports_thinking === 'boolean'
    ? (model.supports_thinking ? 'Thinking' : 'Non-thinking')
    : null;
  const badge = thinkingBadge || (isRecommended ? 'Recommended' : null);
  return {
    id: model?.id || 'unknown-model',
    displayName: String(displayName),
    provider: model?.provider || 'unknown',
    description: buildModelDescription(model),
    context: typeof contextHint === 'number' ? `${contextHint} tokens` : String(contextHint),
    inputPrice: model?.input_price || model?.inputPrice || 'N/A',
    outputPrice: model?.output_price || model?.outputPrice || 'N/A',
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
