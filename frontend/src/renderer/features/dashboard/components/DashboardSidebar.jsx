import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  PenSquare,
  Search,
  Brain,
  BarChart3,
  Cpu,
  PanelLeft,
  PanelLeftClose,
  MoreHorizontal,
  Pencil,
  Pin,
  Trash2,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import ChatGptLogo from '../../../components/ChatGptLogo';

const PRIMARY_NAV_ITEMS = Object.freeze([
  { id: 'new-chat', label: 'New chat', icon: PenSquare },
  { id: 'search', label: 'Search chats', icon: Search },
]);

const PRODUCT_NAV_ITEMS = Object.freeze([
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'models', label: 'Models', icon: Cpu },
]);

function useDismissOnOutside({ isOpen, containerRef, onDismiss }) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        onDismiss();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [containerRef, isOpen, onDismiss]);
}

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

function SidebarNavigation({
  collapsed = false,
  onStartNewChat,
  onOpenSearch,
  onOpenMemory,
  onOpenUsage,
  onOpenModels,
  searchOpen,
  memoryOpen,
  usageOpen,
  modelsOpen,
}) {
  return (
    <>
      <nav className="cg-sidebar-nav">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <SidebarItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            onClick={item.id === 'new-chat' ? onStartNewChat : onOpenSearch}
            isActive={item.id === 'search' && searchOpen}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="cg-sidebar-divider" />

      <nav className="cg-sidebar-nav">
        {PRODUCT_NAV_ITEMS.map((item) => (
          <SidebarItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            onClick={item.id === 'memory' ? onOpenMemory : item.id === 'usage' ? onOpenUsage : onOpenModels}
            isActive={item.id === 'memory' ? memoryOpen : item.id === 'usage' ? usageOpen : modelsOpen}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </>
  );
}

SidebarNavigation.propTypes = {
  collapsed: PropTypes.bool,
  onStartNewChat: PropTypes.func.isRequired,
  onOpenSearch: PropTypes.func.isRequired,
  onOpenMemory: PropTypes.func.isRequired,
  onOpenUsage: PropTypes.func.isRequired,
  onOpenModels: PropTypes.func.isRequired,
  searchOpen: PropTypes.bool.isRequired,
  memoryOpen: PropTypes.bool.isRequired,
  usageOpen: PropTypes.bool.isRequired,
  modelsOpen: PropTypes.bool.isRequired,
};

function SidebarUserMenu({ collapsed = false, onOpenSettings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  useDismissOnOutside({
    isOpen: menuOpen,
    containerRef,
    onDismiss: closeMenu,
  });

  const handleOpenSettings = (tab = 'general') => {
    closeMenu();
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
  onOpenSearch,
  onOpenMemory,
  onOpenUsage,
  onOpenModels,
  onOpenSettings,
  searchOpen,
  memoryOpen,
  usageOpen,
  modelsOpen,
  isLoadingRecentConversations,
  recentConversationsError,
  recentConversationGroups,
  onOpenConversation,
  onRenameConversation,
  onTogglePinConversation,
  onDeleteConversation,
  activeConversationRef,
}) {
  const [openConversationMenuKey, setOpenConversationMenuKey] = useState(null);
  const conversationMenuRef = useRef(null);
  const closeConversationMenu = useCallback(() => {
    setOpenConversationMenuKey(null);
  }, []);
  const hasRecentConversations = (
    recentConversationGroups.today.length > 0
    || recentConversationGroups.yesterday.length > 0
    || recentConversationGroups.previous7Days.length > 0
    || recentConversationGroups.older.length > 0
  );
  const allConversationItems = [
    ...recentConversationGroups.today,
    ...recentConversationGroups.yesterday,
    ...recentConversationGroups.previous7Days,
    ...recentConversationGroups.older,
  ];
  const pinnedConversations = allConversationItems.filter((conversation) => conversation.isPinned);
  const unpinnedConversations = allConversationItems.filter((conversation) => !conversation.isPinned);

  useDismissOnOutside({
    isOpen: Boolean(openConversationMenuKey),
    containerRef: conversationMenuRef,
    onDismiss: closeConversationMenu,
  });

  const handleOpenConversationMenu = (event, conversationKey) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenConversationMenuKey((current) => (current === conversationKey ? null : conversationKey));
  };

  const handleRenameClick = (event, conversation) => {
    event.preventDefault();
    event.stopPropagation();
    closeConversationMenu();
    onRenameConversation(conversation);
  };

  const handlePinClick = (event, conversation) => {
    event.preventDefault();
    event.stopPropagation();
    closeConversationMenu();
    onTogglePinConversation(conversation);
  };

  const handleDeleteClick = (event, conversation) => {
    event.preventDefault();
    event.stopPropagation();
    closeConversationMenu();
    onDeleteConversation(conversation);
  };

  const renderConversationRow = (conversation) => (
    <div
      key={conversation.key}
      className={`cg-chat-item-row${conversation.key === activeConversationRef ? ' active' : ''}${openConversationMenuKey === conversation.key ? ' menu-open' : ''}`}
    >
      <button
        type="button"
        className={`cg-chat-item${conversation.key === activeConversationRef ? ' active' : ''}`}
        onClick={() => onOpenConversation(conversation.conversation)}
      >
        {conversation.title}
      </button>
      <button
        type="button"
        className="cg-chat-item-menu-trigger"
        aria-label={`Conversation actions for ${conversation.title}`}
        onClick={(event) => handleOpenConversationMenu(event, conversation.key)}
      >
        <MoreHorizontal size={15} />
      </button>
      {openConversationMenuKey === conversation.key ? (
        <div className="cg-chat-item-menu" role="menu" ref={conversationMenuRef}>
          <button
            type="button"
            className="cg-chat-item-menu-item"
            role="menuitem"
            onClick={(event) => handleRenameClick(event, conversation.conversation)}
          >
            <Pencil size={15} />
            <span>Rename</span>
          </button>
          <button
            type="button"
            className="cg-chat-item-menu-item"
            role="menuitem"
            onClick={(event) => handlePinClick(event, conversation.conversation)}
          >
            <Pin size={15} />
            <span>{conversation.isPinned ? 'Unpin chat' : 'Pin chat'}</span>
          </button>
          <div className="cg-chat-item-menu-divider" />
          <button
            type="button"
            className="cg-chat-item-menu-item danger"
            role="menuitem"
            onClick={(event) => handleDeleteClick(event, conversation.conversation)}
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  const isCollapsed = !sidebarOpen;
  const ToggleSidebarIcon = isCollapsed ? PanelLeft : PanelLeftClose;
  const toggleSidebarLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <aside className={`cg-sidebar${isCollapsed ? ' collapsed' : ''}`.trim()}>
      <div className="cg-sidebar-header">
        {isCollapsed ? (
          <div className="cg-brand-mark" aria-hidden="true">
            <ChatGptLogo size={14} />
          </div>
        ) : (
          <div className="cg-sidebar-brand">
            <div className="cg-brand-dot">
              <ChatGptLogo size={14} />
            </div>
          </div>
        )}
        <button
          type="button"
          className="cg-sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={toggleSidebarLabel}
          title={toggleSidebarLabel}
        >
          <ToggleSidebarIcon size={18} />
        </button>
      </div>

      <div className="cg-sidebar-content">
        <SidebarNavigation
          collapsed={isCollapsed}
          onStartNewChat={onStartNewChat}
          onOpenSearch={onOpenSearch}
          onOpenMemory={onOpenMemory}
          onOpenUsage={onOpenUsage}
          onOpenModels={onOpenModels}
          searchOpen={searchOpen}
          memoryOpen={memoryOpen}
          usageOpen={usageOpen}
          modelsOpen={modelsOpen}
        />

        {!isCollapsed ? (
          <>
            <div className="cg-sidebar-divider" />
            <div className="cg-sidebar-section-label">Your chats</div>
            <div className="cg-chat-list-scroll">
              {isLoadingRecentConversations ? (
                <div className="cg-chat-list-state">Loading chats...</div>
              ) : recentConversationsError ? (
                <div className="cg-chat-list-state">Unable to load chats.</div>
              ) : hasRecentConversations ? (
                <>
                  {pinnedConversations.length > 0 ? (
                    <div className="cg-chat-list-subheader">Pinned</div>
                  ) : null}
                  {pinnedConversations.map((conversation) => renderConversationRow(conversation))}
                  {pinnedConversations.length > 0 && unpinnedConversations.length > 0 ? (
                    <div className="cg-chat-list-subheader">Recent</div>
                  ) : null}
                  {unpinnedConversations.map((conversation) => renderConversationRow(conversation))}
                </>
              ) : (
                <div className="cg-chat-list-state">No chats yet.</div>
              )}
            </div>
          </>
        ) : null}
      </div>

      <div className="cg-sidebar-footer">
        <SidebarUserMenu collapsed={isCollapsed} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

DashboardSidebar.propTypes = {
  sidebarOpen: PropTypes.bool.isRequired,
  onToggleSidebar: PropTypes.func.isRequired,
  onStartNewChat: PropTypes.func.isRequired,
  onOpenSearch: PropTypes.func.isRequired,
  onOpenMemory: PropTypes.func.isRequired,
  onOpenUsage: PropTypes.func.isRequired,
  onOpenModels: PropTypes.func.isRequired,
  onOpenSettings: PropTypes.func.isRequired,
  searchOpen: PropTypes.bool.isRequired,
  memoryOpen: PropTypes.bool.isRequired,
  usageOpen: PropTypes.bool.isRequired,
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
  onRenameConversation: PropTypes.func.isRequired,
  onTogglePinConversation: PropTypes.func.isRequired,
  onDeleteConversation: PropTypes.func.isRequired,
  activeConversationRef: PropTypes.string,
};

export default DashboardSidebar;
