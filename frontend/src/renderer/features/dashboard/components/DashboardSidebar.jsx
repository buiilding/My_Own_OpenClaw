/**
 * Provides the dashboard sidebar module for the renderer UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  PenSquare,
  PanelLeft,
  PanelLeftClose,
  MoreHorizontal,
  Pencil,
  Pin,
  Trash2,
} from 'lucide-react';
import { workspaceConversationGroupsPropType } from './shared/conversationGroupPropTypes';
import DashboardSidebarNavigation from './sidebar/DashboardSidebarNavigation';
import DashboardSidebarUserMenu from './sidebar/DashboardSidebarUserMenu';
import { useDismissOnOutside } from './sidebar/useDismissOnOutside';

function DashboardSidebar({
  sidebarOpen,
  onExpandSidebar,
  onCollapseSidebar,
  onStartNewChat,
  onOpenSearch,
  onOpenMemory,
  onOpenUsage,
  onOpenModels,
  onOpenMcps,
  onOpenSettings,
  searchOpen,
  memoryOpen,
  usageOpen,
  modelsOpen,
  mcpsOpen,
  isLoadingRecentConversations,
  recentConversationsError,
  recentWorkspaceGroups = [],
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
  const normalizedWorkspaceGroups = Array.isArray(recentWorkspaceGroups)
    ? recentWorkspaceGroups
    : [];
  const hasRecentConversations = normalizedWorkspaceGroups.some(
    (group) => Array.isArray(group?.items) && group.items.length > 0,
  );

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
        data-interaction-label={`Chat: ${conversation.title}`}
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
  const [collapsedHeaderHovered, setCollapsedHeaderHovered] = useState(false);
  const expandSidebarLabel = 'Expand sidebar';
  const collapseSidebarLabel = 'Collapse sidebar';

  useEffect(() => {
    setCollapsedHeaderHovered(false);
  }, [isCollapsed]);

  const resetCollapsedHeaderHover = useCallback(() => {
    setCollapsedHeaderHovered(false);
  }, []);

  const handleExpandSidebar = useCallback(() => {
    resetCollapsedHeaderHover();
    onExpandSidebar();
  }, [onExpandSidebar, resetCollapsedHeaderHover]);

  const handleCollapseSidebar = useCallback(() => {
    resetCollapsedHeaderHover();
    onCollapseSidebar();
  }, [onCollapseSidebar, resetCollapsedHeaderHover]);

  return (
    <aside className={`cg-sidebar${isCollapsed ? ' collapsed' : ''}`.trim()}>
      <div className="cg-sidebar-header">
        {isCollapsed ? (
          <>
            <button
              type="button"
              className="cg-sidebar-brand-toggle"
              onClick={handleExpandSidebar}
              aria-label={expandSidebarLabel}
              title={expandSidebarLabel}
              data-testid="sidebar-expand-button"
              onMouseEnter={() => setCollapsedHeaderHovered(true)}
              onMouseLeave={() => setCollapsedHeaderHovered(false)}
            >
              {collapsedHeaderHovered ? (
                <PanelLeft size={18} data-testid="sidebar-collapsed-expand-icon" />
              ) : (
                <span
                  className="cg-brand-app-icon"
                  data-testid="sidebar-collapsed-brand-icon"
                  aria-hidden="true"
                />
              )}
            </button>
            <button
              type="button"
              className="cg-sidebar-toggle cg-sidebar-collapsed-new-chat"
              onClick={onStartNewChat}
              aria-label="New chat"
              title="New chat"
            >
              <PenSquare size={18} />
            </button>
          </>
        ) : (
          <>
            <div className="cg-sidebar-brand">
              <div className="cg-brand-dot" aria-hidden="true">
                <span className="cg-brand-app-icon" />
              </div>
            </div>
            <button
              type="button"
              className="cg-sidebar-toggle"
              onClick={handleCollapseSidebar}
              aria-label={collapseSidebarLabel}
              title={collapseSidebarLabel}
              data-testid="sidebar-collapse-button"
            >
              <PanelLeftClose size={18} />
            </button>
          </>
        )}
      </div>

      <div className="cg-sidebar-content">
        <DashboardSidebarNavigation
          collapsed={isCollapsed}
          onStartNewChat={onStartNewChat}
          onOpenSearch={onOpenSearch}
          onOpenMemory={onOpenMemory}
          onOpenUsage={onOpenUsage}
          onOpenModels={onOpenModels}
          onOpenMcps={onOpenMcps}
          searchOpen={searchOpen}
          memoryOpen={memoryOpen}
          usageOpen={usageOpen}
          modelsOpen={modelsOpen}
          mcpsOpen={mcpsOpen}
        />

        {!isCollapsed ? (
          <>
            <div className="cg-sidebar-divider" />
            <div className="cg-sidebar-section-label">Your workspace</div>
            <div className="cg-chat-list-scroll">
              {hasRecentConversations ? (
                <>
                  {normalizedWorkspaceGroups.map((group) => (
                    <div key={group.key} className="cg-chat-workspace-group">
                      <div
                        className="cg-chat-list-subheader"
                        title={group.workspacePath || 'No workspace'}
                      >
                        {group.title}
                      </div>
                      <div className="cg-chat-workspace-items">
                        {group.items.map((conversation) => renderConversationRow(conversation))}
                      </div>
                    </div>
                  ))}
                </>
              ) : isLoadingRecentConversations ? (
                <div className="cg-chat-list-state">Loading chats...</div>
              ) : recentConversationsError ? (
                <div className="cg-chat-list-state">Unable to load chats.</div>
              ) : (
                <div className="cg-chat-list-state">No chats yet.</div>
              )}
            </div>
          </>
        ) : null}
      </div>

      <div className="cg-sidebar-footer">
        <DashboardSidebarUserMenu collapsed={isCollapsed} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

DashboardSidebar.propTypes = {
  sidebarOpen: PropTypes.bool.isRequired,
  onExpandSidebar: PropTypes.func.isRequired,
  onCollapseSidebar: PropTypes.func.isRequired,
  onStartNewChat: PropTypes.func.isRequired,
  onOpenSearch: PropTypes.func.isRequired,
  onOpenMemory: PropTypes.func.isRequired,
  onOpenUsage: PropTypes.func.isRequired,
  onOpenModels: PropTypes.func.isRequired,
  onOpenMcps: PropTypes.func.isRequired,
  onOpenSettings: PropTypes.func.isRequired,
  searchOpen: PropTypes.bool.isRequired,
  memoryOpen: PropTypes.bool.isRequired,
  usageOpen: PropTypes.bool.isRequired,
  modelsOpen: PropTypes.bool.isRequired,
  mcpsOpen: PropTypes.bool.isRequired,
  isLoadingRecentConversations: PropTypes.bool.isRequired,
  recentConversationsError: PropTypes.string.isRequired,
  recentWorkspaceGroups: workspaceConversationGroupsPropType,
  onOpenConversation: PropTypes.func.isRequired,
  onRenameConversation: PropTypes.func.isRequired,
  onTogglePinConversation: PropTypes.func.isRequired,
  onDeleteConversation: PropTypes.func.isRequired,
  activeConversationRef: PropTypes.string,
};

export default DashboardSidebar;
