import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import ChatInterface from '../../chat/components/ChatInterface';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import EpisodicMemorySection from './sections/EpisodicMemorySection';
import SemanticMemorySection from './sections/SemanticMemorySection';
import ModelsSection from './sections/ModelsSection';
import SettingsSection from './sections/SettingsSection';
import { DEFAULT_USER_ID } from '../utils/episodicMemoryUtils';

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

function SidebarUserButton({ collapsed = false, onClick }) {
  return (
    <button
      type="button"
      className={`cg-user-button${collapsed ? ' collapsed' : ''}`}
      onClick={onClick}
      aria-label="Open settings"
      title={collapsed ? 'Settings' : undefined}
    >
      <span className="cg-user-avatar" aria-hidden="true">q</span>
      {!collapsed ? (
        <span className="cg-user-meta">
          <span className="cg-user-name">q p</span>
          <span className="cg-user-plan">Pro</span>
        </span>
      ) : null}
    </button>
  );
}

SidebarUserButton.propTypes = {
  collapsed: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
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
  const [recentConversations, setRecentConversations] = useState([]);
  const [isLoadingRecentConversations, setIsLoadingRecentConversations] = useState(false);
  const [recentConversationsError, setRecentConversationsError] = useState('');

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

  const handleStartNewChat = useCallback(() => {
    closeAllPanels();
    window.dispatchEvent(new Event('windie:new-chat'));
  }, [closeAllPanels]);

  const handleMemorySurface = useCallback(() => {
    openMemory(MEMORY_TABS.EPISODIC);
  }, [openMemory]);

  const loadRecentConversations = useCallback(async () => {
    setIsLoadingRecentConversations(true);
    setRecentConversationsError('');

    try {
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.LIST_CONVERSATIONS, {
        userId: DEFAULT_USER_ID,
        limit: 200,
        recordKind: 'transcript',
      });
      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to load recent chats');
      }

      const list = (result?.data?.conversations ?? [])
        .filter((conversation) => Boolean(conversation?.conversation_id))
        .sort((a, b) => {
          const aTime = Date.parse(a?.last_timestamp || '') || 0;
          const bTime = Date.parse(b?.last_timestamp || '') || 0;
          return bTime - aTime;
        });
      setRecentConversations(list);
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to load recent chats');
      setRecentConversations([]);
    } finally {
      setIsLoadingRecentConversations(false);
    }
  }, []);

  useEffect(() => {
    loadRecentConversations();
  }, [loadRecentConversations]);

  const recentConversationGroups = useMemo(() => {
    const groups = {
      today: [],
      yesterday: [],
      previous7Days: [],
      older: [],
    };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    recentConversations.forEach((conversation, index) => {
      const timestampValue = Date.parse(conversation?.last_timestamp || '');
      const conversationDate = Number.isNaN(timestampValue)
        ? new Date(0)
        : new Date(timestampValue);
      const title = `Conversation ${index + 1}`;
      const item = {
        key: conversation?.conversation_id || `conversation-${index}`,
        title,
      };
      if (conversationDate >= today) {
        groups.today.push(item);
        return;
      }
      if (conversationDate >= yesterday) {
        groups.yesterday.push(item);
        return;
      }
      if (conversationDate >= sevenDaysAgo) {
        groups.previous7Days.push(item);
        return;
      }
      groups.older.push(item);
    });

    return groups;
  }, [recentConversations]);

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
      {sidebarOpen ? (
        <aside className="cg-sidebar">
          <div className="cg-sidebar-header">
            <div className="cg-sidebar-brand">
              <div className="cg-brand-dot">
                <ChatGptLogo size={14} />
              </div>
            </div>
            <button
              type="button"
              className="cg-sidebar-toggle"
              onClick={handleSidebarToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          <div className="cg-sidebar-content">
            <nav className="cg-sidebar-nav">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  onClick={item.id === 'new-chat' ? handleStartNewChat : handleChatSurface}
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
                    />
                  );
                }
                return (
                  <SidebarItem
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                  />
                );
              })}
            </nav>

            <div className="cg-sidebar-divider" />
            <div className="cg-sidebar-section-label">GPTs</div>
            <button type="button" className="cg-gpt-card">
              <span className="cg-gpt-dot" aria-hidden="true">C</span>
              <span>Canva</span>
            </button>
            <SidebarItem label="Explore GPTs" icon={Compass} collapsed={false} />
            <div className="cg-sidebar-divider" />
            <div className="cg-sidebar-section-label">Your chats</div>
            <div className="cg-chat-list-scroll">
              <button type="button" className="cg-chat-card">
                Current conversation
              </button>
              {isLoadingRecentConversations ? (
                <div className="cg-chat-list-state">Loading chats...</div>
              ) : recentConversationsError ? (
                <div className="cg-chat-list-state">Unable to load chats.</div>
              ) : (
                <>
                  {recentConversationGroups.today.map((conversation) => (
                    <button key={`today-${conversation.key}`} type="button" className="cg-chat-item" onClick={handleChatSurface}>
                      {conversation.title}
                    </button>
                  ))}
                  {recentConversationGroups.yesterday.map((conversation) => (
                    <button key={`yesterday-${conversation.key}`} type="button" className="cg-chat-item" onClick={handleChatSurface}>
                      {conversation.title}
                    </button>
                  ))}
                  {recentConversationGroups.previous7Days.map((conversation) => (
                    <button key={`week-${conversation.key}`} type="button" className="cg-chat-item" onClick={handleChatSurface}>
                      {conversation.title}
                    </button>
                  ))}
                  {recentConversationGroups.older.map((conversation) => (
                    <button key={`older-${conversation.key}`} type="button" className="cg-chat-item" onClick={handleChatSurface}>
                      {conversation.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="cg-sidebar-footer">
            <SidebarUserButton onClick={openSettings} />
          </div>
        </aside>
      ) : (
        <aside className="cg-sidebar collapsed">
          <div className="cg-sidebar-header">
            <div className="cg-brand-mark" aria-hidden="true">
              <ChatGptLogo size={14} />
            </div>
            <button
              type="button"
              className="cg-sidebar-toggle"
              onClick={handleSidebarToggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeft size={18} />
            </button>
          </div>

          <div className="cg-sidebar-content">
            <nav className="cg-sidebar-nav">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  onClick={item.id === 'new-chat' ? handleStartNewChat : handleChatSurface}
                  collapsed
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
                      collapsed
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
                      collapsed
                    />
                  );
                }
                return (
                  <SidebarItem
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    collapsed
                  />
                );
              })}
            </nav>
          </div>

          <div className="cg-sidebar-footer">
            <SidebarUserButton collapsed onClick={openSettings} />
          </div>
        </aside>
      )}

      <main className={`cg-main-content${sidebarOpen ? '' : ' cg-main-content-collapsed'}`.trim()}>
        <ChatInterface sidebarOpen={sidebarOpen} />
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
