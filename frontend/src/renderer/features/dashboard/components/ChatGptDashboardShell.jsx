import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  PenSquare,
  Search,
  Brain,
  Image,
  LayoutGrid,
  Sparkles,
  Cpu,
  FolderOpen,
  Compass,
  PanelLeft,
  PanelLeftClose,
  User,
} from 'lucide-react';
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

const PRIMARY_NAV_ITEMS = Object.freeze([
  { id: 'new-chat', label: 'New chat', icon: PenSquare },
  { id: 'search', label: 'Search chats', icon: Search },
]);

const PRODUCT_NAV_ITEMS = Object.freeze([
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
  { id: 'deep-research', label: 'Deep research', icon: Sparkles },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
]);

function ChatGptLogo({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

ChatGptLogo.propTypes = {
  size: PropTypes.number,
};

function SidebarItem({
  label,
  icon: Icon,
  onClick = undefined,
  isActive = false,
  collapsed = false,
}) {
  return (
    <button
      type="button"
      className={`cg-nav-item${isActive ? ' active' : ''}${collapsed ? ' collapsed' : ''}`.trim()}
      onClick={onClick}
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      <span className="cg-nav-item-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      {!collapsed ? <span className="cg-nav-item-label">{label}</span> : null}
    </button>
  );
}

SidebarItem.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  onClick: PropTypes.func,
  isActive: PropTypes.bool,
  collapsed: PropTypes.bool,
};

function DashboardModal({ isOpen, onClose, children, className = '' }) {
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
      <div
        className={`cg-modal ${className}`.trim()}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="cg-modal-body">{children}</div>
      </div>
    </div>
  );
}

DashboardModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

function ChatGptDashboardShell({ config, availableModels, onConfigChange }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((current) => !current);
  }, []);

  const handleChatSurface = useCallback(() => {
    closeAllPanels();
  }, [closeAllPanels]);

  const handleMemorySurface = useCallback(() => {
    openMemory(MEMORY_TABS.EPISODIC);
  }, [openMemory]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.MAIN_WINDOW_OPEN_TARGET, (payload) => {
      const target = typeof payload?.target === 'string' ? payload.target : '';
      if (target === 'chat') {
        handleChatSurface();
        return;
      }
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
  }, [handleChatSurface, openMemory, openModels, openSettings]);

  return (
    <div className="cg-dashboard-shell">
      <aside className={`cg-sidebar${sidebarOpen ? '' : ' collapsed'}`.trim()}>
        <div className="cg-sidebar-header">
          <div className="cg-sidebar-brand">
            <div className="cg-brand-dot">
              <ChatGptLogo size={14} />
            </div>
            {sidebarOpen ? (
              <div className="cg-brand-text">
                <h1>ChatGPT</h1>
                <p>WindieOS</p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="cg-sidebar-toggle"
            onClick={handleSidebarToggle}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>

        <div className="cg-sidebar-content">
          <nav className="cg-sidebar-nav">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <SidebarItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                onClick={handleChatSurface}
                collapsed={!sidebarOpen}
              />
            ))}
          </nav>

          <div className="cg-sidebar-divider" />

          <nav className="cg-sidebar-nav">
            {PRODUCT_NAV_ITEMS.map((item) => {
              if (item.id === 'memory') {
                return (
                  <SidebarItem
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    onClick={handleMemorySurface}
                    isActive={memoryOpen}
                    collapsed={!sidebarOpen}
                  />
                );
              }
              if (item.id === 'models') {
                return (
                  <SidebarItem
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    onClick={openModels}
                    isActive={modelsOpen}
                    collapsed={!sidebarOpen}
                  />
                );
              }
              return (
                <SidebarItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  collapsed={!sidebarOpen}
                />
              );
            })}
          </nav>

          {sidebarOpen ? (
            <>
              <div className="cg-sidebar-divider" />
              <div className="cg-sidebar-section-label">GPTs</div>
              <button type="button" className="cg-gpt-card">
                <span className="cg-gpt-dot" aria-hidden="true">C</span>
                <span>Canva</span>
              </button>
              <SidebarItem label="Explore GPTs" icon={Compass} collapsed={false} />
              <div className="cg-sidebar-divider" />
              <div className="cg-sidebar-section-label">Your chats</div>
              <button type="button" className="cg-chat-card">
                Current conversation
              </button>
            </>
          ) : null}
        </div>

        <div className="cg-sidebar-footer">
          <SidebarItem
            label="Settings"
            icon={User}
            onClick={openSettings}
            isActive={settingsOpen}
            collapsed={!sidebarOpen}
          />
        </div>
      </aside>

      {!sidebarOpen ? (
        <button
          type="button"
          className="cg-sidebar-open"
          onClick={handleSidebarToggle}
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <PanelLeft size={18} />
        </button>
      ) : null}

      <main className={`cg-main-content${sidebarOpen ? '' : ' cg-main-content-collapsed'}`.trim()}>
        <ChatInterface />
      </main>

      <DashboardModal isOpen={memoryOpen} onClose={() => setMemoryOpen(false)} className="cg-modal-wide">
        <div className="cg-panel-wrapper">
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
        </div>
      </DashboardModal>

      <DashboardModal isOpen={modelsOpen} onClose={() => setModelsOpen(false)}>
        <div className="cg-panel-wrapper">
          <ModelsSection config={config} availableModels={availableModels} onConfigChange={onConfigChange} />
        </div>
      </DashboardModal>

      <DashboardModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <div className="cg-panel-wrapper">
          <SettingsSection config={config} onConfigChange={onConfigChange} />
        </div>
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
