import PropTypes from 'prop-types';
import { Minus, Square, X } from 'lucide-react';

function MainWindowControls({
  onMinimize,
  onToggleMaximize,
  onClose,
  className = '',
  showMaximize = true,
}) {
  const containerClassName = ['chat-window-controls', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClassName}>
      <button
        type="button"
        className="chat-window-control-btn chat-window-control-minimize"
        aria-label="Minimize window"
        title="Minimize"
        onClick={onMinimize}
      >
        <Minus size={14} strokeWidth={2.2} />
      </button>
      {showMaximize ? (
        <button
          type="button"
          className="chat-window-control-btn chat-window-control-maximize"
          aria-label="Toggle maximize window"
          title="Maximize or restore"
          onClick={onToggleMaximize}
        >
          <Square size={11} strokeWidth={2.2} />
        </button>
      ) : null}
      <button
        type="button"
        className="chat-window-control-btn chat-window-control-close"
        aria-label="Close window"
        title="Close"
        onClick={onClose}
      >
        <X size={13} strokeWidth={2.2} />
      </button>
    </div>
  );
}

MainWindowControls.propTypes = {
  onMinimize: PropTypes.func,
  onToggleMaximize: PropTypes.func,
  onClose: PropTypes.func,
  className: PropTypes.string,
  showMaximize: PropTypes.bool,
};

export default MainWindowControls;
