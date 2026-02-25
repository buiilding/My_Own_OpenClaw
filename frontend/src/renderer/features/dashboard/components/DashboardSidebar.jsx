import { useEffect, useRef, useState } from 'react';
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
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
} from 'lucide-react';

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

function SidebarUserButton({ collapsed = false, onClick, isExpanded = false }) {
  return (
    <button
      type="button"
      className={`cg-user-button${collapsed ? ' collapsed' : ''}`}
      onClick={onClick}
      aria-label="Open profile menu"
      aria-expanded={isExpanded}
      title={collapsed ? 'Profile menu' : undefined}
      data-testid="sidebar-user-menu-trigger"
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
  isExpanded: PropTypes.bool,
};

function SidebarUserMenu({ collapsed = false, onOpenSettings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleOpenSettings = (tab = 'general') => {
    setMenuOpen(false);
    onOpenSettings(tab);
  };

  return (
    <div ref={containerRef} className={`cg-user-menu-wrap${collapsed ? ' collapsed' : ''}`}>
      <SidebarUserButton
        collapsed={collapsed}
        onClick={() => setMenuOpen((current) => !current)}
        isExpanded={menuOpen}
      />
      {menuOpen ? (
        <div
          className={`cg-user-menu${collapsed ? ' collapsed' : ''}`}
          role="menu"
          aria-label="Profile menu"
        >
          <div className="cg-user-menu-header">
            <span className="cg-user-avatar" aria-hidden="true">q</span>
            <div className="cg-user-menu-meta">
              <p>q p</p>
              <span>@peterbuics</span>
            </div>
          </div>

          <button
            type="button"
            className="cg-user-menu-item"
            onClick={() => handleOpenSettings('personalization')}
            role="menuitem"
          >
            <Sparkles size={16} />
            <span>Personalization</span>
          </button>
          <button
            type="button"
            className="cg-user-menu-item"
            onClick={() => handleOpenSettings('general')}
            role="menuitem"
            data-testid="sidebar-user-menu-settings"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
          <button type="button" className="cg-user-menu-item" role="menuitem">
            <HelpCircle size={16} />
            <span>Help</span>
            <ChevronRight size={14} className="cg-user-menu-chevron" />
          </button>

          <div className="cg-user-menu-divider" />

          <button type="button" className="cg-user-menu-item" role="menuitem">
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

SidebarUserMenu.propTypes = {
  collapsed: PropTypes.bool,
  onOpenSettings: PropTypes.func.isRequired,
};

function DashboardSidebar({
  sidebarOpen,
  onToggleSidebar,
  onStartNewChat,
  onChatSurface,
  onOpenMemory,
  onOpenModels,
  onOpenSettings,
  memoryOpen,
  modelsOpen,
  isLoadingRecentConversations,
  recentConversationsError,
  recentConversationGroups,
  onOpenConversation,
  activeConversationRef,
}) {
  const hasRecentConversations = (
    recentConversationGroups.today.length > 0
    || recentConversationGroups.yesterday.length > 0
    || recentConversationGroups.previous7Days.length > 0
    || recentConversationGroups.older.length > 0
  );

  if (!sidebarOpen) {
    return (
      <aside className="cg-sidebar collapsed">
        <div className="cg-sidebar-header">
          <div className="cg-brand-mark" aria-hidden="true">
            <ChatGptLogo size={14} />
          </div>
          <button
            type="button"
            className="cg-sidebar-toggle"
            onClick={onToggleSidebar}
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
                onClick={item.id === 'new-chat' ? onStartNewChat : onChatSurface}
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
                    onClick={onOpenMemory}
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
                    onClick={onOpenModels}
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
          <SidebarUserMenu collapsed onOpenSettings={onOpenSettings} />
        </div>
      </aside>
    );
  }

  return (
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
          onClick={onToggleSidebar}
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
              onClick={item.id === 'new-chat' ? onStartNewChat : onChatSurface}
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
                  onClick={onOpenMemory}
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
                  onClick={onOpenModels}
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
          {isLoadingRecentConversations ? (
            <div className="cg-chat-list-state">Loading chats...</div>
          ) : recentConversationsError ? (
            <div className="cg-chat-list-state">Unable to load chats.</div>
          ) : hasRecentConversations ? (
            <>
              {recentConversationGroups.today.map((conversation) => (
                <button
                  key={`today-${conversation.key}`}
                  type="button"
                  className={`cg-chat-item${conversation.key === activeConversationRef ? ' active' : ''}`}
                  onClick={() => onOpenConversation(conversation.conversation)}
                >
                  {conversation.title}
                </button>
              ))}
              {recentConversationGroups.yesterday.map((conversation) => (
                <button
                  key={`yesterday-${conversation.key}`}
                  type="button"
                  className={`cg-chat-item${conversation.key === activeConversationRef ? ' active' : ''}`}
                  onClick={() => onOpenConversation(conversation.conversation)}
                >
                  {conversation.title}
                </button>
              ))}
              {recentConversationGroups.previous7Days.map((conversation) => (
                <button
                  key={`week-${conversation.key}`}
                  type="button"
                  className={`cg-chat-item${conversation.key === activeConversationRef ? ' active' : ''}`}
                  onClick={() => onOpenConversation(conversation.conversation)}
                >
                  {conversation.title}
                </button>
              ))}
              {recentConversationGroups.older.map((conversation) => (
                <button
                  key={`older-${conversation.key}`}
                  type="button"
                  className={`cg-chat-item${conversation.key === activeConversationRef ? ' active' : ''}`}
                  onClick={() => onOpenConversation(conversation.conversation)}
                >
                  {conversation.title}
                </button>
              ))}
            </>
          ) : (
            <div className="cg-chat-list-state">No chats yet.</div>
          )}
        </div>
      </div>

      <div className="cg-sidebar-footer">
        <SidebarUserMenu onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

DashboardSidebar.propTypes = {
  sidebarOpen: PropTypes.bool.isRequired,
  onToggleSidebar: PropTypes.func.isRequired,
  onStartNewChat: PropTypes.func.isRequired,
  onChatSurface: PropTypes.func.isRequired,
  onOpenMemory: PropTypes.func.isRequired,
  onOpenModels: PropTypes.func.isRequired,
  onOpenSettings: PropTypes.func.isRequired,
  memoryOpen: PropTypes.bool.isRequired,
  modelsOpen: PropTypes.bool.isRequired,
  isLoadingRecentConversations: PropTypes.bool.isRequired,
  recentConversationsError: PropTypes.string.isRequired,
  recentConversationGroups: PropTypes.shape({
    today: PropTypes.array.isRequired,
    yesterday: PropTypes.array.isRequired,
    previous7Days: PropTypes.array.isRequired,
    older: PropTypes.array.isRequired,
  }).isRequired,
  onOpenConversation: PropTypes.func.isRequired,
  activeConversationRef: PropTypes.string,
};

export default DashboardSidebar;
