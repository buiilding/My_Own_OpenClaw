/**
 * Provides the chat interface header controls module for the renderer UI.
 */

import { Brain, ChevronDown, Search, Volume2, Workflow } from 'lucide-react';
import MainWindowControls from '../../../components/MainWindowControls';
import ChatBrowserSessionControl from './ChatBrowserSessionControl';
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
  reasoningModeMenuRef,
  providerMenuOpen,
  modelMenuOpen,
  reasoningModeMenuOpen,
  setProviderMenuOpen,
  setModelMenuOpen,
  setReasoningModeMenuOpen,
  providerLabel,
  providerOptions,
  modelLabelBase,
  selectedModelOption,
  modelOptions,
  showReasoningModeSelector,
  selectedReasoningModeLabel,
  reasoningModeOptions,
  speechModeEnabled,
  findBarOpen,
  activeWorkspaceName,
  activeWorkspacePath,
  handleOpenFind,
  handleChangeWorkspace,
  devUiEnabled,
  handleProviderSelect,
  handleModelSelect,
  handleReasoningModeSelect,
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
                setReasoningModeMenuOpen(false);
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
                setReasoningModeMenuOpen(false);
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
          {showReasoningModeSelector ? (
            <div className="chat-reasoning-mode-dropdown" ref={reasoningModeMenuRef}>
              <button
                type="button"
                className="chat-reasoning-mode-selector"
                aria-label="Reasoning mode selector"
                aria-expanded={reasoningModeMenuOpen}
                onClick={() => {
                  setReasoningModeMenuOpen((current) => !current);
                  setProviderMenuOpen(false);
                  setModelMenuOpen(false);
                }}
              >
                <span>{selectedReasoningModeLabel || 'Reasoning'}</span>
                <ChevronDown size={16} />
              </button>
              {reasoningModeMenuOpen ? (
                <div className="chat-reasoning-mode-menu" role="menu">
                  {reasoningModeOptions.map((option) => (
                    <button
                      key={`${option.mode}:${option.modelId}`}
                      type="button"
                      className="chat-reasoning-mode-menu-item"
                      role="menuitem"
                      onClick={() => {
                        handleReasoningModeSelect(option.mode);
                      }}
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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
          <ChatBrowserSessionControl />
          <button
            type="button"
            className={`chat-active-workspace-chip chat-active-workspace-button${
              activeWorkspaceName ? '' : ' is-empty'
            }`}
            title={activeWorkspacePath || 'Select active workspace'}
            aria-label={activeWorkspaceName
              ? `Change active workspace from ${activeWorkspaceName}`
              : 'Set active workspace'}
            onClick={handleChangeWorkspace}
          >
            <span className="chat-active-workspace-label">Workspace</span>
            <span className="chat-active-workspace-name">
              {activeWorkspaceName || 'Set workspace'}
            </span>
          </button>
          <button
            type="button"
            className={`chat-top-icon-btn${findBarOpen ? ' is-enabled' : ''}`}
            aria-label="Find in conversation"
            title="Find in conversation"
            onClick={handleOpenFind}
          >
            <Search size={18} />
          </button>
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
