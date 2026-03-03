import { useCallback, useEffect, useRef, useState } from 'react';
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

function ChatGptDashboardShell({
  config,
  availableModels,
  onConfigChange,
  vmModeEnabled = false,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardOpening, setDashboardOpening] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');
  const [modelsOpen, setModelsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isTransportConnected, setIsTransportConnected] = useState(true);
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const wasHiddenRef = useRef(false);
  const sessionInfo = useTranscriptSessionInfo();
  const resolvedUserId = sessionInfo.userId || DEFAULT_USER_ID;

  const setChatMessages = useChatStore((state) => state.setMessages);
  const setChatIsSending = useChatStore((state) => state.setIsSending);
  const setChatThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const {
    searchQuery,
    isSearchingConversations,
    searchConversationsError,
    isLoadingRecentConversations,
    recentConversationsError,
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
    setChatMessages,
    setChatIsSending,
    setChatThinkingStatus,
    setChatActiveConversationRef,
    searchOpen,
  });

  const triggerDashboardOpenAnimation = useCallback(() => {
    setDashboardOpening(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setDashboardOpening(true);
      });
    });
  }, []);

  const closeAllPanels = useCallback(() => {
    setSettingsOpen(false);
    setModelsOpen(false);
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
    window.dispatchEvent(new Event('windie:new-chat'));
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === 'visible' && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        triggerDashboardOpenAnimation();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerDashboardOpenAnimation]);

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
        <ChatInterface sidebarOpen={sidebarOpen} focusComposerToken={composerFocusToken} />
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
            activeConversationRef={sessionInfo.conversationRef || null}
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

          <DashboardModal isOpen={usageOpen} onClose={() => setUsageOpen(false)}>
            <div className="cg-panel-wrapper">
              <UsageSection onClose={() => setUsageOpen(false)} />
            </div>
          </DashboardModal>

          <DashboardModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            className="cg-modal-settings"
          >
            <div className="cg-panel-wrapper">
              <SettingsSection
                config={config}
                onConfigChange={onConfigChange}
                initialTab={settingsInitialTab}
                onClose={() => setSettingsOpen(false)}
              />
            </div>
          </DashboardModal>
        </>
      ) : null}
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
  vmModeEnabled: PropTypes.bool,
};

export default ChatGptDashboardShell;
