import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import ChatInterface from '../../chat/components/ChatInterface';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import EpisodicMemorySection from './sections/EpisodicMemorySection';
import SemanticMemorySection from './sections/SemanticMemorySection';
import ModelsSection from './sections/ModelsSection';
import SettingsSection from './sections/SettingsSection';

const MEMORY_TABS = Object.freeze({
  EPISODIC: 'episodic',
  SEMANTIC: 'semantic',
});

function DashboardModal({ isOpen, title, onClose, children, className = '' }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="cg-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`cg-modal ${className}`.trim()}>
        <div className="cg-modal-header">
          <h2>{title}</h2>
          <button type="button" className="cg-modal-close" onClick={onClose} aria-label={`Close ${title}`}>
            x
          </button>
        </div>
        <div className="cg-modal-body">{children}</div>
      </div>
    </div>
  );
}

DashboardModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

function ChatGptDashboardShell({ config, availableModels, onConfigChange }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryTab, setMemoryTab] = useState(MEMORY_TABS.EPISODIC);

  const closeAllPanels = useCallback(() => {
    setSettingsOpen(false);
    setModelsOpen(false);
    setMemoryOpen(false);
  }, []);

  const openSettings = useCallback(() => {
    closeAllPanels();
    setSettingsOpen(true);
  }, [closeAllPanels]);

  const openModels = useCallback(() => {
    closeAllPanels();
    setModelsOpen(true);
  }, [closeAllPanels]);

  const openMemory = useCallback((tab = MEMORY_TABS.EPISODIC) => {
    closeAllPanels();
    setMemoryTab(tab);
    setMemoryOpen(true);
  }, [closeAllPanels]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.MAIN_WINDOW_OPEN_TARGET, (payload) => {
      const target = typeof payload?.target === 'string' ? payload.target : '';
      if (target === 'settings') {
        openSettings();
        return;
      }
      if (target === 'models') {
        openModels();
        return;
      }
      if (target === 'memory') {
        openMemory(MEMORY_TABS.EPISODIC);
      }
    });
    return () => {
      removeListener?.();
    };
  }, [openMemory, openModels, openSettings]);

  return (
    <div className="cg-dashboard-shell">
      <aside className="cg-sidebar">
        <div className="cg-sidebar-brand">
          <div className="cg-brand-dot">W</div>
          <div className="cg-brand-text">
            <h1>WindieOS</h1>
            <p>Conversation Hub</p>
          </div>
        </div>

        <nav className="cg-sidebar-nav">
          <button type="button" className="cg-nav-item active">
            Chat
          </button>
          <button
            type="button"
            className={`cg-nav-item${memoryOpen ? ' selected' : ''}`}
            onClick={() => openMemory(MEMORY_TABS.EPISODIC)}
          >
            Memory
          </button>
          <button
            type="button"
            className={`cg-nav-item${modelsOpen ? ' selected' : ''}`}
            onClick={openModels}
          >
            Models
          </button>
          <button
            type="button"
            className={`cg-nav-item${settingsOpen ? ' selected' : ''}`}
            onClick={openSettings}
          >
            Settings
          </button>
        </nav>
      </aside>

      <main className="cg-main-content">
        <ChatInterface />
      </main>

      <DashboardModal isOpen={memoryOpen} title="Memory" onClose={() => setMemoryOpen(false)} className="cg-modal-wide">
        <div className="cg-memory-tabs">
          <button
            type="button"
            className={`cg-memory-tab${memoryTab === MEMORY_TABS.EPISODIC ? ' active' : ''}`}
            onClick={() => setMemoryTab(MEMORY_TABS.EPISODIC)}
          >
            Episodic
          </button>
          <button
            type="button"
            className={`cg-memory-tab${memoryTab === MEMORY_TABS.SEMANTIC ? ' active' : ''}`}
            onClick={() => setMemoryTab(MEMORY_TABS.SEMANTIC)}
          >
            Semantic
          </button>
        </div>
        {memoryTab === MEMORY_TABS.EPISODIC ? (
          <EpisodicMemorySection
            onSelectSection={(sectionId) => {
              if (sectionId === 'chat') {
                setMemoryOpen(false);
              }
            }}
          />
        ) : (
          <SemanticMemorySection />
        )}
      </DashboardModal>

      <DashboardModal isOpen={modelsOpen} title="Models" onClose={() => setModelsOpen(false)}>
        <ModelsSection config={config} availableModels={availableModels} onConfigChange={onConfigChange} />
      </DashboardModal>

      <DashboardModal isOpen={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <SettingsSection config={config} onConfigChange={onConfigChange} />
      </DashboardModal>
    </div>
  );
}

ChatGptDashboardShell.propTypes = {
  config: PropTypes.shape({}),
  availableModels: PropTypes.shape({
    local: PropTypes.array,
    online: PropTypes.array,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default ChatGptDashboardShell;
