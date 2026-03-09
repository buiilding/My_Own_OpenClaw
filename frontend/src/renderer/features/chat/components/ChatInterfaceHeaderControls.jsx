import { Brain, ChevronDown, Volume2, Workflow } from 'lucide-react';
import MainWindowControls from '../../../components/MainWindowControls';
import { formatProviderLabel } from '../utils/chatModelOptions';

function renderModelLabel(label, supportsThinking) {
  return (
    <span className="chat-model-label">
      <span>{label}</span>
      {supportsThinking ? <Brain size={13} strokeWidth={2} aria-hidden="true" /> : null}
    </span>
  );
}

function ChatInterfaceHeaderControls({
  vmModeEnabled,
  providerMenuRef,
  modelMenuRef,
  providerMenuOpen,
  modelMenuOpen,
  setProviderMenuOpen,
  setModelMenuOpen,
  providerLabel,
  providerOptions,
  modelLabelBase,
  selectedModelOption,
  modelOptions,
  speechModeEnabled,
  devUiEnabled,
  handleProviderSelect,
  handleModelSelect,
  handleToggleSpeechMode,
  handleRunAutoCompaction,
  handleWindowMinimize,
  handleWindowToggleMaximize,
  handleWindowClose,
}) {
  return (
    <header className="chat-header">
      <div className="chat-title-block">
        <div className="chat-model-row">
          <div className="chat-provider-dropdown" ref={providerMenuRef}>
            <button
              type="button"
              className="chat-provider-selector"
              aria-label="Provider selector"
              aria-expanded={providerMenuOpen}
              onClick={() => {
                setProviderMenuOpen((current) => !current);
                setModelMenuOpen(false);
              }}
            >
              <span>{providerLabel}</span>
              <ChevronDown size={16} />
            </button>
            {providerMenuOpen ? (
              <div className="chat-provider-menu" role="menu">
                {providerOptions.length > 0 ? (
                  providerOptions.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className="chat-provider-menu-item"
                      role="menuitem"
                      onClick={() => {
                        handleProviderSelect(provider);
                      }}
                    >
                      <span>{formatProviderLabel(provider)}</span>
                    </button>
                  ))
                ) : (
                  <div className="chat-provider-menu-item" aria-disabled="true">
                    <span>No providers available</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="chat-model-dropdown" ref={modelMenuRef}>
            <button
              type="button"
              className="chat-model-selector"
              aria-label="Model selector"
              aria-expanded={modelMenuOpen}
              onClick={() => {
                setModelMenuOpen((current) => !current);
                setProviderMenuOpen(false);
              }}
            >
              {renderModelLabel(modelLabelBase, selectedModelOption?.supportsThinking)}
              <ChevronDown size={16} />
            </button>
            {modelMenuOpen ? (
              <div className="chat-model-menu" role="menu">
                {modelOptions.length > 0 ? (
                  modelOptions.map((option) => (
                    <button
                      key={`${option.provider || 'unknown'}:${option.id}`}
                      type="button"
                      className="chat-model-menu-item"
                      role="menuitem"
                      onClick={() => {
                        handleModelSelect(option);
                      }}
                    >
                      {renderModelLabel(option.label || option.id, option.supportsThinking)}
                    </button>
                  ))
                ) : (
                  <div className="chat-model-menu-item" aria-disabled="true">
                    <span>No models available</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="chat-meta">
        {!vmModeEnabled ? (
          <MainWindowControls
            onMinimize={handleWindowMinimize}
            onToggleMaximize={handleWindowToggleMaximize}
            onClose={handleWindowClose}
          />
        ) : null}
        <div className="chat-utility-controls">
          <button
            type="button"
            className={`chat-top-icon-btn${speechModeEnabled ? ' is-enabled' : ''}`}
            aria-label="Toggle text-to-speech"
            title={speechModeEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
            onClick={handleToggleSpeechMode}
          >
            <Volume2 size={18} />
          </button>
          {devUiEnabled ? (
            <button
              type="button"
              className="chat-top-icon-btn"
              aria-label="Run auto compaction"
              title="Run auto compaction"
              onClick={handleRunAutoCompaction}
            >
              <Workflow size={18} />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default ChatInterfaceHeaderControls;
