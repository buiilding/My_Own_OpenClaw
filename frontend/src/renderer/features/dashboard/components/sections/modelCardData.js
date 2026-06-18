/**
 * Provides the model card data module for the renderer UI.
 */

import { resolveProviderModelDisplay } from '../../../../app/skin/desktopRuntimeConfig';

function buildModelDescription(model) {
  if (typeof model?.description === 'string' && model.description.trim()) {
    return model.description.trim();
  }
  return resolveProviderModelDisplay(model?.provider).description;
}

function buildModelStrengths(model) {
  if (Array.isArray(model?.strengths) && model.strengths.length > 0) {
    return model.strengths.map((strength) => String(strength));
  }
  return Array.from(resolveProviderModelDisplay(model?.provider).strengths);
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
