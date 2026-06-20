/**
 * Provides the model cards module for the renderer UI.
 */

import PropTypes from 'prop-types';
import {
  Check,
  ChevronRight,
  Clock,
  DollarSign,
  Layers,
  Zap,
} from 'lucide-react';

export function ProviderCard({ provider, count, isSelected, onSelect }) {
  return (
    <button
      type="button"
      className={`model-surface-provider-card${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(provider)}
      aria-label={`Show ${provider} models`}
    >
      <div className="model-surface-provider-card-head">
        <div className="model-surface-provider-id-wrap">
          <div className={`model-surface-provider-icon-wrap${isSelected ? ' selected' : ''}`}>
            <Layers size={16} />
          </div>
          <div className="model-surface-provider-title-wrap">
            <h3>{provider}</h3>
            <p>{count} model{count === 1 ? '' : 's'}</p>
          </div>
        </div>

        <div className="model-surface-provider-state-wrap">
          {isSelected ? (
            <div className="model-surface-selected-dot">
              <Check size={12} />
            </div>
          ) : null}
          <ChevronRight size={16} className="model-surface-chevron hovered" />
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

export function ModelCard({ model, isSelected, isHovered, onSelect, onHover }) {
  return (
    <button
      type="button"
      className={`model-surface-card${isSelected ? ' selected' : ''}${isHovered ? ' hovered' : ''}`}
      onMouseEnter={() => onHover(model.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(model)}
    >
      <div className="model-surface-card-head">
        <div className="model-surface-id-wrap">
          <div className={`model-surface-icon-wrap${isSelected ? ' selected' : ''}`}>
            <Zap size={16} />
          </div>
          <div className="model-surface-title-wrap">
            <div className="model-surface-title-row">
              <h3>{model.displayName || model.id}</h3>
              {model.badge ? (
                <span className={`model-surface-badge${model.badge === 'Recommended' ? ' recommended' : ''}`}>
                  {model.badge}
                </span>
              ) : null}
            </div>
            <p>{model.provider} · {model.context}</p>
          </div>
        </div>

        <div className="model-surface-state-wrap">
          {isSelected ? (
            <div className="model-surface-selected-dot">
              <Check size={12} />
            </div>
          ) : null}
          <ChevronRight size={16} className={`model-surface-chevron${isHovered ? ' hovered' : ''}`} />
        </div>
      </div>

      <div className={`model-surface-details${isHovered ? ' expanded' : ''}`} aria-hidden={!isHovered}>
        <div className="model-surface-details-inner">
          <div className="model-surface-details-content">
            <p className="model-surface-description">{model.description}</p>
            <div className="model-surface-metrics-row">
              <div className="model-surface-metric">
                <DollarSign size={14} />
                <div>
                  <span>Input</span>
                  <strong>{model.inputPrice}</strong>
                </div>
              </div>
              <div className="model-surface-metric">
                <DollarSign size={14} />
                <div>
                  <span>Output</span>
                  <strong>{model.outputPrice}</strong>
                </div>
              </div>
              <div className="model-surface-metric">
                <Clock size={14} />
                <div>
                  <span>Latency</span>
                  <strong>{model.latency}</strong>
                </div>
              </div>
            </div>

            <div className="model-surface-strengths">
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
    displayName: PropTypes.string,
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
