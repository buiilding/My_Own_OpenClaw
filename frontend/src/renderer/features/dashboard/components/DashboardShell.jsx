/**
 * Provides the dashboard shell module for the renderer UI.
 */

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import ChatInterface from '../../chat/components/ChatInterface';
import { useChatStore } from '../../chat/stores/chatStore';
import { DesktopClientSessionRuntimeClient } from '../../../app/runtime/desktopClientSessionRuntimeClient';
import { DesktopWindowRuntimeClient } from '../../../app/runtime/desktopWindowRuntimeClient';
import ModelsSection from './sections/ModelsSection';
import McpsSection from './sections/McpsSection';
import SettingsSection from './sections/SettingsSection';
import UsageSection from './sections/UsageSection';
import DashboardSidebar from './DashboardSidebar';
import { useDashboardConversations } from '../hooks/useDashboardConversations';
import MemorySection from './sections/MemorySection';
import SearchChatsModal from './SearchChatsModal';
import { resetActiveChatSession } from '../../../app/runtime/desktopActiveChatSessionRuntime';
import { useRendererConversationSessionInfo } from '../../chat/session/useRendererConversationSessionInfo';
import { DesktopWorkspaceRuntimeClient } from '../../../app/runtime/desktopWorkspaceRuntimeClient';
import { dispatchDesktopRuntimeNewChatEvent } from '../../../app/runtime/desktopChatEvents';
import { requestDashboardLayoutPass } from '../../../app/runtime/desktopDashboardLayoutRuntime';

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

const DASHBOARD_OPEN_ANIMATION_MS = 420;
const DASHBOARD_SCROLL_LOCK_CLASS = 'cg-scroll-locked';

function DashboardShell({
  config,
  availableModels,
  onConfigChange,
  vmModeEnabled = false,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardOpening, setDashboardOpening] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');
  const [modelsOpen, setModelsOpen] = useState(false);
  const [mcpsOpen, setMcpsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [snapshotUserId, setSnapshotUserId] = useState(null);
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const sessionInfo = useRendererConversationSessionInfo();
  const resolvedUserId = sessionInfo.userId || snapshotUserId || null;

  const activeChatConversationRef = useChatStore((state) => state.activeConversationRef);
  const setChatMessages = useChatStore((state) => state.setMessages);
  const clearChatMessages = useChatStore((state) => state.clearMessages);
  const setChatIsSending = useChatStore((state) => state.setIsSending);
  const setChatThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setChatTokenCounts = useChatStore((state) => state.setTokenCounts);
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const getChatWorkspaceState = useChatStore((state) => state.getWorkspaceState);
  const {
    searchQuery,
    isSearchingConversations,
    searchConversationsError,
    isLoadingRecentConversations,
    openingConversationRef,
    recentConversationsError,
    loadRecentConversations,
    handleOpenConversation,
    handleRenameConversation,
    handleTogglePinConversation,
    handleDeleteConversation,
    recentConversationGroups,
    recentWorkspaceGroups,
    searchedConversationGroups,
    setSearchQuery,
    resetSearch,
  } = useDashboardConversations({
    resolvedUserId,
    sessionConversationRef: sessionInfo.conversationRef,
    activeConversationRef: activeChatConversationRef,
    getChatWorkspaceState,
    clearChatMessages,
    setChatMessages,
    setChatIsSending,
    setChatThinkingStatus,
    setChatTokenCounts,
    setChatActiveConversationRef,
    searchOpen,
  });

  const closeAllPanels = useCallback(() => {
    setSettingsOpen(false);
    setModelsOpen(false);
    setMcpsOpen(false);
    setMemoryOpen(false);
    setUsageOpen(false);
    setSearchOpen(false);
  }, []);

  const openSettings = useCallback((tab = 'general') => {
    closeAllPanels();
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  }, [closeAllPanels]);

  const openModels = useCallback(() => {
    closeAllPanels();
    setModelsOpen(true);
  }, [closeAllPanels]);

  const openMcps = useCallback(() => {
    closeAllPanels();
    setMcpsOpen(true);
  }, [closeAllPanels]);

  const openMemory = useCallback(() => {
    closeAllPanels();
    setMemoryOpen(true);
  }, [closeAllPanels]);

  const openUsage = useCallback(() => {
    closeAllPanels();
    setUsageOpen(true);
  }, [closeAllPanels]);

  const handleExpandSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const handleCollapseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const requestComposerFocus = useCallback(() => {
    setComposerFocusToken((current) => current + 1);
  }, []);

  const handleChatSurface = useCallback(({ focusComposer = false } = {}) => {
    closeAllPanels();
    if (focusComposer) {
      requestComposerFocus();
    }
  }, [closeAllPanels, requestComposerFocus]);

  const handleStartNewChat = useCallback(() => {
    closeAllPanels();
    dispatchDesktopRuntimeNewChatEvent();
  }, [closeAllPanels]);

  const handleMemorySurface = useCallback(() => {
    openMemory();
  }, [openMemory]);

  const handleOpenSearch = useCallback(() => {
    closeAllPanels();
    resetSearch();
    setSearchOpen(true);
  }, [closeAllPanels, resetSearch]);

  const openConversationFromDashboard = useCallback((conversation) => {
    closeAllPanels();
    void handleOpenConversation(conversation);
  }, [closeAllPanels, handleOpenConversation]);

  const handleChatsCleared = useCallback(async () => {
    resetActiveChatSession({
      conversationRef: sessionInfo.conversationRef || null,
      userId: resolvedUserId,
      clearMessages: clearChatMessages,
      setIsSending: setChatIsSending,
      setThinkingStatus: setChatThinkingStatus,
      setTokenCounts: setChatTokenCounts,
      setChatActiveConversationRef,
    });
    DesktopWorkspaceRuntimeClient.clearAllConversationWorkspaceBindings();
    await loadRecentConversations();
  }, [
    clearChatMessages,
    loadRecentConversations,
    resolvedUserId,
    sessionInfo.conversationRef,
    setChatActiveConversationRef,
    setChatIsSending,
    setChatThinkingStatus,
    setChatTokenCounts,
  ]);

  useEffect(() => {
    if (!dashboardOpening) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDashboardOpening(false);
    }, DASHBOARD_OPEN_ANIMATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [dashboardOpening]);

  const wakeDashboardShell = useCallback(() => {
    setDashboardOpening(true);
    requestDashboardLayoutPass();
  }, []);

  useEffect(() => {
    const rootElement = document.getElementById('root');
    const scrollLockTargets = [document.documentElement, document.body, rootElement].filter(Boolean);
    scrollLockTargets.forEach((target) => target.classList.add(DASHBOARD_SCROLL_LOCK_CLASS));
    return () => {
      scrollLockTargets.forEach((target) => target.classList.remove(DASHBOARD_SCROLL_LOCK_CLASS));
    };
  }, []);


  useEffect(() => {
    if (vmModeEnabled) {
      return undefined;
    }
    const removeListener = DesktopWindowRuntimeClient.onMainWindowOpenTarget((payload) => {
      wakeDashboardShell();
      void loadRecentConversations('main-window-open-target');
      const target = payload.target;
      if (target === 'chat') {
        handleChatSurface({ focusComposer: true });
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
      if (target === 'mcps') {
        openMcps();
        return;
      }
      if (target === 'memory') {
        openMemory();
      }
    });

    return () => {
      removeListener?.();
    };
  }, [
    handleChatSurface,
    loadRecentConversations,
    openMemory,
    openMcps,
    openModels,
    openSettings,
    vmModeEnabled,
    wakeDashboardShell,
  ]);

  useEffect(() => {
    DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()
      .then((payload) => {
        if (payload?.userId) {
          setSnapshotUserId(payload.userId);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className={`cg-dashboard-shell${dashboardOpening ? ' cg-dashboard-shell-opening' : ''}`}>
      {!vmModeEnabled && !settingsOpen ? (
        <DashboardSidebar
          sidebarOpen={sidebarOpen}
          onExpandSidebar={handleExpandSidebar}
          onCollapseSidebar={handleCollapseSidebar}
          onStartNewChat={handleStartNewChat}
          onOpenSearch={handleOpenSearch}
          onOpenMemory={handleMemorySurface}
          onOpenUsage={openUsage}
          onOpenModels={openModels}
          onOpenMcps={openMcps}
          onOpenSettings={openSettings}
          searchOpen={searchOpen}
          memoryOpen={memoryOpen}
          usageOpen={usageOpen}
          modelsOpen={modelsOpen}
          mcpsOpen={mcpsOpen}
          isLoadingRecentConversations={isLoadingRecentConversations}
          recentConversationsError={recentConversationsError}
          recentWorkspaceGroups={recentWorkspaceGroups}
          onOpenConversation={openConversationFromDashboard}
          onRenameConversation={handleRenameConversation}
          onTogglePinConversation={handleTogglePinConversation}
          onDeleteConversation={handleDeleteConversation}
          activeConversationRef={activeChatConversationRef || sessionInfo.conversationRef || null}
        />
      ) : null}

      <main className={`cg-main-content${
        vmModeEnabled || settingsOpen
          ? ''
          : (sidebarOpen ? '' : ' cg-main-content-collapsed')
      }`.trim()}>
        {settingsOpen && !vmModeEnabled ? (
          <SettingsSection
            config={config}
            onConfigChange={onConfigChange}
            initialTab={settingsInitialTab}
            onClose={() => setSettingsOpen(false)}
            onChatsCleared={handleChatsCleared}
          />
        ) : (
          <ChatInterface
            sidebarOpen={sidebarOpen}
            focusComposerToken={composerFocusToken}
            loadingConversationRef={openingConversationRef}
          />
        )}
      </main>

      {!vmModeEnabled ? (
        <>
          <SearchChatsModal
            isOpen={searchOpen}
            onClose={() => setSearchOpen(false)}
            onStartNewChat={handleStartNewChat}
            onOpenConversation={openConversationFromDashboard}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            isSearching={isSearchingConversations}
            searchError={searchConversationsError}
            recentConversationGroups={recentConversationGroups}
            searchConversationGroups={searchedConversationGroups}
            activeConversationRef={activeChatConversationRef || sessionInfo.conversationRef || null}
          />

          <DashboardModal isOpen={memoryOpen} onClose={() => setMemoryOpen(false)}>
            <div className="cg-panel-wrapper">
              <MemorySection onClose={() => setMemoryOpen(false)} />
            </div>
          </DashboardModal>

          <DashboardModal isOpen={modelsOpen} onClose={() => setModelsOpen(false)}>
            <div className="cg-panel-wrapper">
              <ModelsSection
                config={config}
                availableModels={availableModels}
                onConfigChange={onConfigChange}
                onClose={() => setModelsOpen(false)}
              />
            </div>
          </DashboardModal>

          <DashboardModal isOpen={mcpsOpen} onClose={() => setMcpsOpen(false)}>
            <div className="cg-panel-wrapper">
              <McpsSection onClose={() => setMcpsOpen(false)} />
            </div>
          </DashboardModal>

          <DashboardModal isOpen={usageOpen} onClose={() => setUsageOpen(false)}>
            <div className="cg-panel-wrapper">
              <UsageSection onClose={() => setUsageOpen(false)} />
            </div>
          </DashboardModal>

        </>
      ) : null}
    </div>
  );
}

DashboardShell.propTypes = {
  config: PropTypes.shape({}),
  availableModels: PropTypes.shape({
    local: PropTypes.array,
    online: PropTypes.array,
  }),
  onConfigChange: PropTypes.func.isRequired,
  vmModeEnabled: PropTypes.bool,
};

export default DashboardShell;
