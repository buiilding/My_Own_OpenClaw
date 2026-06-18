/**
 * Provides the models section module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  buildModelConfigUpdate,
  evaluateModelSelection,
  getCurrentModels,
  getFallbackModelSelection,
} from '../../utils/modelSelectionUtils';
import ApiKeysSection from './ApiKeysSection';
import {
  normalizeProviderLabel,
  toModelCard,
  toProviderCards,
} from './modelCardData';
import {
  ModelCard,
  ProviderCard,
} from './modelCards';
import { normalizeProviderApiKeys } from './providerApiKeys';
import { providerApiKeysPropType } from './providerApiKeysPropTypes';
import { DesktopSettingsRuntimeClient } from '../../../../app/runtime/desktopSettingsRuntimeClient';

function ModelsSection({ config, availableModels, onConfigChange, onClose = () => {} }) {
  const [modelResetWarning, setModelResetWarning] = useState('');
  const [hoveredModel, setHoveredModel] = useState(null);
  const [activeProviderView, setActiveProviderView] = useState(null);
  const warningTimeoutRef = useRef(null);
  const requestedCatalogMetadataRefreshRef = useRef(false);

  const modelMode = config?.model_mode || 'online';
  const selectedModelId = config?.selected_model_id || '';
  const selectedProvider = config?.model_provider || '';
  const providerApiKeys = normalizeProviderApiKeys(config?.provider_api_keys);
  const speechModeEnabled = config?.speech_mode_enabled ?? false;
  const interactionMode = config?.interaction_mode || 'agent';

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

  const handleProviderApiKeysChange = useCallback((nextProviderApiKeys) => {
    onConfigChange({
      provider_api_keys: normalizeProviderApiKeys(nextProviderApiKeys),
    });
  }, [onConfigChange]);

  useEffect(() => {
    const onlineModels = Array.isArray(availableModels?.online) ? availableModels.online : [];
    if (modelMode !== 'online' || requestedCatalogMetadataRefreshRef.current || onlineModels.length === 0) {
      return;
    }

    const hasIncompleteCatalogMetadata = onlineModels.some((model) => {
      if (!model || typeof model !== 'object') {
        return false;
      }
      const hasContext = model.context_window || model.contextWindow || model.context;
      const hasDescription = typeof model.description === 'string' && model.description.trim().length > 0;
      return !hasContext || !hasDescription;
    });

    if (hasIncompleteCatalogMetadata) {
      requestedCatalogMetadataRefreshRef.current = true;
      try {
        DesktopSettingsRuntimeClient.listModels();
      } catch (error) {
        console.warn('[ModelsSection] Failed to refresh model catalog metadata:', error?.message || error);
      }
    }
  }, [availableModels, modelMode]);

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

        {!activeProviderView ? (
          <ApiKeysSection
            providerApiKeys={providerApiKeys}
            onProviderApiKeysChange={handleProviderApiKeysChange}
          />
        ) : null}
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
    provider_api_keys: providerApiKeysPropType,
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
