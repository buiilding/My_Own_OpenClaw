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
            <p>{count} model{count === 1 ? '' : 's'}</p>
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

export function ModelCard({ model, isSelected, isHovered, onSelect, onHover }) {
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
              <h3>{model.displayName || model.id}</h3>
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
