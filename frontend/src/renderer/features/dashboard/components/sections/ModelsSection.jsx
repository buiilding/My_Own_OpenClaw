import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  DollarSign,
  Layers,
  X,
  Zap,
} from 'lucide-react';
import {
  buildModelConfigUpdate,
  evaluateModelSelection,
  getCurrentModels,
  getFallbackModelSelection,
} from '../../utils/modelSelectionUtils';

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

function toModelCard(model, isRecommended) {
  const contextHint = model?.context_window || model?.contextWindow || model?.context || 'Context unknown';
  return {
    id: model?.id || 'unknown-model',
    provider: model?.provider || 'unknown',
    description: buildModelDescription(model),
    context: typeof contextHint === 'number' ? `${contextHint} tokens` : String(contextHint),
    inputPrice: model?.input_price || model?.inputPrice || 'N/A',
    outputPrice: model?.output_price || model?.outputPrice || 'N/A',
    latency: model?.latency || '~1.5s',
    strengths: buildModelStrengths(model),
    badge: isRecommended ? 'Recommended' : null,
  };
}

function normalizeProviderLabel(provider) {
  const value = provider === undefined || provider === null ? '' : String(provider).trim();
  return value || 'Unknown provider';
}

function toProviderCards(models, selectedModelId, selectedProvider) {
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

function ProviderCard({ provider, count, isSelected, onSelect }) {
  return (
    <button
      type="button"
      className={`clone-model-provider-card${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(provider)}
      aria-label={`Show ${provider} models`}
    >
      <div className="clone-model-provider-card-head">
        <div className="clone-model-provider-id-wrap">
          <div className={`clone-model-provider-icon-wrap${isSelected ? ' selected' : ''}`}>
            <Layers size={16} />
          </div>
          <div className="clone-model-provider-title-wrap">
            <h3>{provider}</h3>
            <p>{count} model{count === 1 ? '' : 's'} available</p>
          </div>
        </div>

        <div className="clone-model-provider-state-wrap">
          {isSelected ? (
            <div className="clone-model-selected-dot">
              <Check size={12} />
            </div>
          ) : null}
          <ChevronRight size={16} className="clone-model-chevron hovered" />
        </div>
      </div>
    </button>
  );
}

ProviderCard.propTypes = {
  provider: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};

function ModelCard({ model, isSelected, isHovered, onSelect, onHover }) {
  return (
    <button
      type="button"
      className={`clone-model-card${isSelected ? ' selected' : ''}${isHovered ? ' hovered' : ''}`}
      onMouseEnter={() => onHover(model.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(model)}
    >
      <div className="clone-model-card-head">
        <div className="clone-model-id-wrap">
          <div className={`clone-model-icon-wrap${isSelected ? ' selected' : ''}`}>
            <Zap size={16} />
          </div>
          <div className="clone-model-title-wrap">
            <div className="clone-model-title-row">
              <h3>{model.id}</h3>
              {model.badge ? (
                <span className={`clone-model-badge${model.badge === 'Recommended' ? ' recommended' : ''}`}>
                  {model.badge}
                </span>
              ) : null}
            </div>
            <p>{model.provider} · {model.context}</p>
          </div>
        </div>

        <div className="clone-model-state-wrap">
          {isSelected ? (
            <div className="clone-model-selected-dot">
              <Check size={12} />
            </div>
          ) : null}
          <ChevronRight size={16} className={`clone-model-chevron${isHovered ? ' hovered' : ''}`} />
        </div>
      </div>

      <div className={`clone-model-details${isHovered ? ' expanded' : ''}`} aria-hidden={!isHovered}>
        <div className="clone-model-details-inner">
          <div className="clone-model-details-content">
            <p className="clone-model-description">{model.description}</p>
            <div className="clone-model-metrics-row">
              <div className="clone-model-metric">
                <DollarSign size={14} />
                <div>
                  <span>Input</span>
                  <strong>{model.inputPrice}</strong>
                </div>
              </div>
              <div className="clone-model-metric">
                <DollarSign size={14} />
                <div>
                  <span>Output</span>
                  <strong>{model.outputPrice}</strong>
                </div>
              </div>
              <div className="clone-model-metric">
                <Clock size={14} />
                <div>
                  <span>Latency</span>
                  <strong>{model.latency}</strong>
                </div>
              </div>
            </div>

            <div className="clone-model-strengths">
              {model.strengths.map((strength) => (
                <span key={`${model.id}-${strength}`}>{strength}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

ModelCard.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
    provider: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    context: PropTypes.string.isRequired,
    inputPrice: PropTypes.string.isRequired,
    outputPrice: PropTypes.string.isRequired,
    latency: PropTypes.string.isRequired,
    strengths: PropTypes.arrayOf(PropTypes.string).isRequired,
    badge: PropTypes.string,
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  isHovered: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onHover: PropTypes.func.isRequired,
};

function ModelsSection({ config, availableModels, onConfigChange, onClose = () => {} }) {
  const [modelResetWarning, setModelResetWarning] = useState('');
  const [hoveredModel, setHoveredModel] = useState(null);
  const [activeProviderView, setActiveProviderView] = useState(null);
  const warningTimeoutRef = useRef(null);

  const modelMode = config?.model_mode || 'online';
  const selectedModelId = config?.selected_model_id || '';
  const selectedProvider = config?.model_provider || '';
  const speechModeEnabled = config?.speech_mode_enabled ?? false;
  const interactionMode = config?.interaction_mode || 'chat';

  const currentModels = useMemo(
    () => getCurrentModels(availableModels, modelMode),
    [availableModels, modelMode],
  );

  const modelCards = useMemo(() => {
    const scopedModels = activeProviderView
      ? currentModels.filter((model) => normalizeProviderLabel(model?.provider) === activeProviderView)
      : currentModels;
    return scopedModels.map((model, index) => toModelCard(model, index === 0));
  }, [activeProviderView, currentModels]);

  const providerCards = useMemo(
    () => toProviderCards(currentModels, selectedModelId, selectedProvider),
    [currentModels, selectedModelId, selectedProvider],
  );

  const applyModelSelection = useCallback((selectedModel) => {
    onConfigChange(
      buildModelConfigUpdate({
        modelMode,
        selectedModel,
        speechModeEnabled,
        interactionMode,
      }),
    );
  }, [interactionMode, modelMode, onConfigChange, speechModeEnabled]);

  useEffect(() => {
    if (!config) {
      return;
    }

    const hasAnyModels = (availableModels?.local?.length || 0) > 0
      || (availableModels?.online?.length || 0) > 0;
    if (!hasAnyModels) {
      return;
    }

    const selectionState = evaluateModelSelection({
      selectedModelId,
      selectedProvider,
      currentModels,
    });

    if (selectionState.status === 'missing') {
      setModelResetWarning(selectionState.warning);
      applyModelSelection(getFallbackModelSelection(currentModels));
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      warningTimeoutRef.current = setTimeout(() => setModelResetWarning(''), 5000);
      return;
    }

    if (selectionState.status === 'provider-mismatch') {
      applyModelSelection(selectionState.model);
    }
  }, [
    applyModelSelection,
    availableModels,
    config,
    currentModels,
    selectedModelId,
    selectedProvider,
  ]);

  useEffect(() => {
    if (!activeProviderView) {
      return;
    }
    const providerStillAvailable = providerCards.some(
      (providerCard) => providerCard.provider === activeProviderView,
    );
    if (!providerStillAvailable) {
      setActiveProviderView(null);
      setHoveredModel(null);
    }
  }, [activeProviderView, providerCards]);

  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="clone-model-panel">
      <div className="clone-panel-close-row">
        <button
          type="button"
          className="clone-panel-close"
          onClick={onClose}
          aria-label="Close models"
        >
          <X size={18} />
        </button>
      </div>
      <div className="clone-panel-header">
        <h1>Models</h1>
        <p>
          {activeProviderView
            ? `Select a model from ${activeProviderView}.`
            : 'Select a provider first, then choose a model.'}
        </p>
      </div>

      <div className="clone-panel-body clone-model-body">
        {modelResetWarning ? (
          <div className="clone-panel-warning">{modelResetWarning}</div>
        ) : null}

        {providerCards.length === 0 ? (
          <div className="clone-empty-state">No models available for the current mode.</div>
        ) : !activeProviderView ? (
          <div className="clone-model-provider-list">
            {providerCards.map((providerCard) => (
              <ProviderCard
                key={providerCard.provider}
                provider={providerCard.provider}
                count={providerCard.count}
                isSelected={providerCard.hasSelectedModel}
                onSelect={(provider) => {
                  setActiveProviderView(provider);
                  setHoveredModel(null);
                }}
              />
            ))}
          </div>
        ) : modelCards.length === 0 ? (
          <div className="clone-empty-state">No models available for this provider.</div>
        ) : (
          <>
            <div className="clone-model-provider-toolbar">
              <button
                type="button"
                className="clone-model-provider-back"
                onClick={() => {
                  setActiveProviderView(null);
                  setHoveredModel(null);
                }}
                aria-label="Back to providers"
              >
                <ArrowLeft size={14} />
                <span>Providers</span>
              </button>
              <p className="clone-model-provider-meta">{activeProviderView}</p>
            </div>

          <div className="clone-model-list">
            {modelCards.map((model) => {
              const isSelected = model.id === selectedModelId && model.provider === selectedProvider;
              const modelHoverKey = `${model.provider}-${model.id}`;
              const isHovered = hoveredModel === modelHoverKey;
              const sourceModel = currentModels.find((candidate) => candidate.id === model.id && candidate.provider === model.provider)
                || currentModels.find((candidate) => candidate.id === model.id)
                || null;

              return (
                <ModelCard
                  key={`${model.provider}-${model.id}`}
                  model={model}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  onHover={(nextModelId) => {
                    if (!nextModelId) {
                      setHoveredModel(null);
                      return;
                    }
                    setHoveredModel(`${model.provider}-${nextModelId}`);
                  }}
                  onSelect={() => {
                    if (sourceModel) {
                      applyModelSelection(sourceModel);
                    }
                  }}
                />
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

ModelsSection.propTypes = {
  config: PropTypes.shape({
    model_mode: PropTypes.oneOf(['local', 'online']),
    selected_model_id: PropTypes.string,
    model_provider: PropTypes.string,
    interaction_mode: PropTypes.string,
    speech_mode_enabled: PropTypes.bool,
  }),
  availableModels: PropTypes.shape({
    local: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        provider: PropTypes.string.isRequired,
      }),
    ),
    online: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        provider: PropTypes.string.isRequired,
      }),
    ),
  }),
  onConfigChange: PropTypes.func.isRequired,
  onClose: PropTypes.func,
};

export default ModelsSection;
