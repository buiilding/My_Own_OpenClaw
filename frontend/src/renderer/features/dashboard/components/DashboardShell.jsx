import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import ChatInterface from '../../chat/components/ChatInterface';
import { useChatStore } from '../../chat/stores/chatStore';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import ModelsSection from './sections/ModelsSection';
import SettingsSection from './sections/SettingsSection';
import UsageSection from './sections/UsageSection';
import { DEFAULT_USER_ID } from '../utils/episodicMemoryUtils';
import DashboardSidebar from './DashboardSidebar';
import { useTranscriptSessionInfo } from '../hooks/useTranscriptSessionInfo';
import { useDashboardConversations } from '../hooks/useDashboardConversations';
import MemorySection from './sections/MemorySection';
import SearchChatsModal from './SearchChatsModal';
import { resetActiveChatSession } from '../../chat/utils/session/resetActiveChatSession';

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
const DASHBOARD_PANEL = Object.freeze({
  SEARCH: 'search',
  SETTINGS: 'settings',
  MODELS: 'models',
  MEMORY: 'memory',
  USAGE: 'usage',
});

function DashboardShell({
  config,
  availableModels,
  onConfigChange,
  vmModeEnabled = false,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardOpening, setDashboardOpening] = useState(true);
  const [activePanel, setActivePanel] = useState(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');
  const [isTransportConnected, setIsTransportConnected] = useState(true);
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const sessionInfo = useTranscriptSessionInfo();
  const resolvedUserId = sessionInfo.userId || DEFAULT_USER_ID;
  const searchOpen = activePanel === DASHBOARD_PANEL.SEARCH;
  const settingsOpen = activePanel === DASHBOARD_PANEL.SETTINGS;
  const modelsOpen = activePanel === DASHBOARD_PANEL.MODELS;
  const memoryOpen = activePanel === DASHBOARD_PANEL.MEMORY;
  const usageOpen = activePanel === DASHBOARD_PANEL.USAGE;

  const setChatMessages = useChatStore((state) => state.setMessages);
  const clearChatMessages = useChatStore((state) => state.clearMessages);
  const setChatIsSending = useChatStore((state) => state.setIsSending);
  const setChatThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setChatTokenCounts = useChatStore((state) => state.setTokenCounts);
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const {
    searchQuery,
    isSearchingConversations,
    searchConversationsError,
    isLoadingRecentConversations,
    recentConversationsError,
    loadRecentConversations,
    handleOpenConversation,
    handleRenameConversation,
    handleTogglePinConversation,
    handleDeleteConversation,
    recentConversationGroups,
    searchedConversationGroups,
    setSearchQuery,
    resetSearch,
  } = useDashboardConversations({
    resolvedUserId,
    sessionConversationRef: sessionInfo.conversationRef,
    clearChatMessages,
    setChatMessages,
    setChatIsSending,
    setChatThinkingStatus,
    setChatTokenCounts,
    setChatActiveConversationRef,
    searchOpen,
  });

  const closeAllPanels = useCallback(() => {
    setActivePanel(null);
  }, []);

  const openSettings = useCallback((tab = 'general') => {
    closeAllPanels();
    setSettingsInitialTab(tab);
    setActivePanel(DASHBOARD_PANEL.SETTINGS);
  }, [closeAllPanels]);

  const openModels = useCallback(() => {
    closeAllPanels();
    setActivePanel(DASHBOARD_PANEL.MODELS);
  }, [closeAllPanels]);

  const openMemory = useCallback(() => {
    closeAllPanels();
    setActivePanel(DASHBOARD_PANEL.MEMORY);
  }, [closeAllPanels]);

  const openUsage = useCallback(() => {
    closeAllPanels();
    setActivePanel(DASHBOARD_PANEL.USAGE);
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
    window.dispatchEvent(new Event('windie:new-chat'));
  }, [closeAllPanels]);

  const handleMemorySurface = useCallback(() => {
    openMemory();
  }, [openMemory]);

  const handleOpenSearch = useCallback(() => {
    closeAllPanels();
    resetSearch();
    setActivePanel(DASHBOARD_PANEL.SEARCH);
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
    const removeListener = IpcBridge.on(ON_CHANNELS.MAIN_WINDOW_OPEN_TARGET, (payload) => {
      const target = typeof payload?.target === 'string' ? payload.target : '';
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
      if (target === 'memory') {
        openMemory();
      }
    });

    return () => {
      removeListener?.();
    };
  }, [handleChatSurface, openMemory, openModels, openSettings, vmModeEnabled]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.IPC_STATUS, (payload) => {
      setIsTransportConnected(payload?.isConnected === true);
    });
    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then((payload) => {
        setIsTransportConnected(payload?.isConnected === true);
      })
      .catch(() => {});
  }, []);

  return (
    <div className={`cg-dashboard-shell${dashboardOpening ? ' cg-dashboard-shell-opening' : ''}`}>
      {!vmModeEnabled ? (
        <DashboardSidebar
          sidebarOpen={sidebarOpen}
          onExpandSidebar={handleExpandSidebar}
          onCollapseSidebar={handleCollapseSidebar}
          onStartNewChat={handleStartNewChat}
          onOpenSearch={handleOpenSearch}
          onOpenMemory={handleMemorySurface}
          onOpenUsage={openUsage}
          onOpenModels={openModels}
          onOpenSettings={openSettings}
          searchOpen={searchOpen}
          memoryOpen={memoryOpen}
          usageOpen={usageOpen}
          modelsOpen={modelsOpen}
          isLoadingRecentConversations={isLoadingRecentConversations}
          recentConversationsError={recentConversationsError}
          recentConversationGroups={recentConversationGroups}
          onOpenConversation={openConversationFromDashboard}
          onRenameConversation={handleRenameConversation}
          onTogglePinConversation={handleTogglePinConversation}
          onDeleteConversation={handleDeleteConversation}
          activeConversationRef={sessionInfo.conversationRef || null}
          isTransportConnected={isTransportConnected}
        />
      ) : null}

      <main className={`cg-main-content${
        vmModeEnabled
          ? ''
          : (sidebarOpen ? '' : ' cg-main-content-collapsed')
      }`.trim()}>
        <ChatInterface
          sidebarOpen={sidebarOpen}
          focusComposerToken={composerFocusToken}
          onOpenModels={vmModeEnabled ? undefined : openModels}
        />
      </main>

      {!vmModeEnabled ? (
        <>
          <SearchChatsModal
            isOpen={searchOpen}
            onClose={() => setActivePanel((current) => (
              current === DASHBOARD_PANEL.SEARCH ? null : current
            ))}
            onStartNewChat={handleStartNewChat}
            onOpenConversation={openConversationFromDashboard}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            isSearching={isSearchingConversations}
            searchError={searchConversationsError}
            recentConversationGroups={recentConversationGroups}
            searchConversationGroups={searchedConversationGroups}
            activeConversationRef={sessionInfo.conversationRef || null}
          />

          <DashboardModal
            isOpen={memoryOpen}
            onClose={() => setActivePanel((current) => (
              current === DASHBOARD_PANEL.MEMORY ? null : current
            ))}
          >
            <div className="cg-panel-wrapper">
              <MemorySection onClose={() => setActivePanel(null)} />
            </div>
          </DashboardModal>

          <DashboardModal
            isOpen={modelsOpen}
            onClose={() => setActivePanel((current) => (
              current === DASHBOARD_PANEL.MODELS ? null : current
            ))}
          >
            <div className="cg-panel-wrapper">
              <ModelsSection
                config={config}
                availableModels={availableModels}
                onConfigChange={onConfigChange}
                onClose={() => setActivePanel(null)}
              />
            </div>
          </DashboardModal>

          <DashboardModal
            isOpen={usageOpen}
            onClose={() => setActivePanel((current) => (
              current === DASHBOARD_PANEL.USAGE ? null : current
            ))}
          >
            <div className="cg-panel-wrapper">
              <UsageSection onClose={() => setActivePanel(null)} />
            </div>
          </DashboardModal>

          <DashboardModal
            isOpen={settingsOpen}
            onClose={() => setActivePanel((current) => (
              current === DASHBOARD_PANEL.SETTINGS ? null : current
            ))}
            className="cg-modal-settings"
          >
            <div className="cg-panel-wrapper">
              <SettingsSection
                config={config}
                onConfigChange={onConfigChange}
                initialTab={settingsInitialTab}
                onClose={() => setActivePanel(null)}
                onChatsCleared={handleChatsCleared}
              />
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
