import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import ChatInterface from '../../chat/components/ChatInterface';
import { useChatStore } from '../../chat/stores/chatStore';
import { ApiClient } from '../../../infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import ModelsSection from './sections/ModelsSection';
import SettingsSection from './sections/SettingsSection';
import UsageSection from './sections/UsageSection';
import {
  DEFAULT_USER_ID,
  parseMemoriesToMessages,
  toRehydrateMessagePayload,
} from '../utils/episodicMemoryUtils';
import DashboardSidebar from './DashboardSidebar';
import { useTranscriptSessionInfo } from '../hooks/useTranscriptSessionInfo';
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

function ChatGptDashboardShell({ config, availableModels, onConfigChange }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardOpening, setDashboardOpening] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');
  const [modelsOpen, setModelsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedConversations, setSearchedConversations] = useState([]);
  const [isSearchingConversations, setIsSearchingConversations] = useState(false);
  const [searchConversationsError, setSearchConversationsError] = useState('');
  const [recentConversations, setRecentConversations] = useState([]);
  const [pinnedConversationRefs, setPinnedConversationRefs] = useState([]);
  const [isLoadingRecentConversations, setIsLoadingRecentConversations] = useState(false);
  const [recentConversationsError, setRecentConversationsError] = useState('');
  const wasHiddenRef = useRef(false);
  const pendingTitlePollTimersRef = useRef(new Map());
  const sessionInfo = useTranscriptSessionInfo();
  const resolvedUserId = sessionInfo.userId || DEFAULT_USER_ID;

  const setChatMessages = useChatStore((state) => state.setMessages);
  const setChatIsSending = useChatStore((state) => state.setIsSending);
  const setChatThinkingStatus = useChatStore((state) => state.setThinkingStatus);

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
    openMemory();
  }, [openMemory]);

  const handleOpenSearch = useCallback(() => {
    closeAllPanels();
    setSearchQuery('');
    setSearchedConversations([]);
    setSearchConversationsError('');
    setIsSearchingConversations(false);
    setSearchOpen(true);
  }, [closeAllPanels]);

  const loadRecentConversations = useCallback(async () => {
    setIsLoadingRecentConversations(true);
    setRecentConversationsError('');

    try {
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.LIST_CONVERSATIONS, {
        userId: resolvedUserId,
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
      setPinnedConversationRefs((current) => {
        const knownIds = new Set(list.map((conversation) => conversation?.conversation_id));
        return current.filter((conversationRef) => knownIds.has(conversationRef));
      });
      return list;
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to load recent chats');
      setRecentConversations([]);
      return [];
    } finally {
      setIsLoadingRecentConversations(false);
    }
  }, [resolvedUserId]);

  const clearPendingTitlePoll = useCallback((conversationRef) => {
    const timerId = pendingTitlePollTimersRef.current.get(conversationRef);
    if (timerId) {
      window.clearTimeout(timerId);
      pendingTitlePollTimersRef.current.delete(conversationRef);
    }
  }, []);

  const scheduleTitleVisibilityPoll = useCallback((conversationRef) => {
    if (!conversationRef) {
      return;
    }
    clearPendingTitlePoll(conversationRef);

    let attempts = 0;
    const maxAttempts = 40;
    const delayMs = 1250;

    const poll = async () => {
      attempts += 1;
      const list = await loadRecentConversations();
      const isVisible = list.some((conversation) => conversation?.conversation_id === conversationRef);
      if (isVisible || attempts >= maxAttempts) {
        clearPendingTitlePoll(conversationRef);
        return;
      }
      const nextTimer = window.setTimeout(() => {
        void poll();
      }, delayMs);
      pendingTitlePollTimersRef.current.set(conversationRef, nextTimer);
    };

    void poll();
  }, [clearPendingTitlePoll, loadRecentConversations]);

  const handleOpenConversation = useCallback(async (conversation) => {
    const conversationRef = conversation?.conversation_id;
    if (!conversationRef) {
      return;
    }

    closeAllPanels();
    setRecentConversationsError('');

    try {
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_CONVERSATION, {
        userId: resolvedUserId,
        conversationId: conversationRef,
        limit: 1000,
        recordKind: conversation?.record_kind || 'transcript',
      });

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to load conversation');
      }

      const memories = result?.data?.memories ?? [];
      const parsedMessages = parseMemoriesToMessages(memories);

      await ApiClient.sendRehydrateConversation(
        conversationRef,
        memories.map(toRehydrateMessagePayload),
      );

      setActiveConversationRef(conversationRef);
      updateTranscriptSession(conversationRef, resolvedUserId);
      setChatMessages(parsedMessages);
      setChatIsSending(false);
      setChatThinkingStatus(null);
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to open conversation');
    }
  }, [
    closeAllPanels,
    resolvedUserId,
    setChatIsSending,
    setChatMessages,
    setChatThinkingStatus,
  ]);

  const handleRenameConversation = useCallback((conversation) => {
    const conversationRef = conversation?.conversation_id;
    if (!conversationRef) {
      return;
    }
    const currentTitle = typeof conversation?.title === 'string'
      ? conversation.title.trim()
      : '';
    const nextTitleInput = window.prompt('Rename chat', currentTitle || 'New chat');
    if (typeof nextTitleInput !== 'string') {
      return;
    }
    const nextTitle = nextTitleInput.trim();
    if (!nextTitle || nextTitle === currentTitle) {
      return;
    }
    setRecentConversations((current) => current.map((item) => (
      item?.conversation_id === conversationRef
        ? { ...item, title: nextTitle }
        : item
    )));
    setSearchedConversations((current) => current.map((item) => (
      item?.conversation_id === conversationRef
        ? { ...item, title: nextTitle }
        : item
    )));
  }, []);

  const handleTogglePinConversation = useCallback((conversation) => {
    const conversationRef = conversation?.conversation_id;
    if (!conversationRef) {
      return;
    }
    setPinnedConversationRefs((current) => {
      if (current.includes(conversationRef)) {
        return current.filter((id) => id !== conversationRef);
      }
      return [conversationRef, ...current];
    });
  }, []);

  const handleDeleteConversation = useCallback(async (conversation) => {
    const conversationRef = conversation?.conversation_id;
    if (!conversationRef) {
      return;
    }
    const shouldDelete = window.confirm('Delete this chat? This cannot be undone.');
    if (!shouldDelete) {
      return;
    }

    try {
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.DELETE_CONVERSATION, {
        userId: resolvedUserId,
        conversationId: conversationRef,
        recordKind: conversation?.record_kind || 'transcript',
      });
      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to delete chat');
      }

      setRecentConversations((current) => current.filter((item) => item?.conversation_id !== conversationRef));
      setSearchedConversations((current) => current.filter((item) => item?.conversation_id !== conversationRef));
      setPinnedConversationRefs((current) => current.filter((id) => id !== conversationRef));
      if (sessionInfo.conversationRef === conversationRef) {
        setActiveConversationRef(null);
        updateTranscriptSession(null, resolvedUserId);
        setChatMessages([]);
        setChatIsSending(false);
        setChatThinkingStatus(null);
      }
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to delete chat');
    }
  }, [
    resolvedUserId,
    sessionInfo.conversationRef,
    setChatIsSending,
    setChatMessages,
    setChatThinkingStatus,
  ]);

  useEffect(() => {
    loadRecentConversations();
  }, [loadRecentConversations]);

  useEffect(() => {
    const handleTranscriptEntryStored = (event) => {
      const detail = event?.detail;
      const role = typeof detail?.role === 'string' ? detail.role : '';
      const messageType = typeof detail?.messageType === 'string' ? detail.messageType : '';
      const conversationRef = typeof detail?.conversationRef === 'string'
        ? detail.conversationRef
        : '';
      if (role !== 'assistant' || messageType !== 'llm-text') {
        return;
      }
      if (!conversationRef) {
        void loadRecentConversations();
        return;
      }
      scheduleTitleVisibilityPoll(conversationRef);
    };

    window.addEventListener('transcript-entry-stored', handleTranscriptEntryStored);
    return () => {
      window.removeEventListener('transcript-entry-stored', handleTranscriptEntryStored);
    };
  }, [loadRecentConversations, scheduleTitleVisibilityPoll]);

  useEffect(() => {
    return () => {
      for (const timerId of pendingTitlePollTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      pendingTitlePollTimersRef.current.clear();
    };
  }, []);

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
      const resolvedTitle = typeof conversation?.title === 'string'
        ? conversation.title.trim()
        : '';
      const item = {
        key: conversation?.conversation_id || `conversation-${index}`,
        title: resolvedTitle || 'New chat',
        conversation,
        isPinned: pinnedConversationRefs.includes(conversation?.conversation_id),
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
  }, [pinnedConversationRefs, recentConversations]);

  const searchedConversationGroups = useMemo(() => {
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

    searchedConversations.forEach((conversation, index) => {
      const timestampValue = Date.parse(conversation?.last_timestamp || '');
      const conversationDate = Number.isNaN(timestampValue)
        ? new Date(0)
        : new Date(timestampValue);
      const resolvedTitle = typeof conversation?.title === 'string'
        ? conversation.title.trim()
        : '';
      const item = {
        key: conversation?.conversation_id || `search-conversation-${index}`,
        title: resolvedTitle || 'New chat',
        snippet: typeof conversation?.snippet === 'string' ? conversation.snippet.trim() : '',
        matchedRole: typeof conversation?.matched_role === 'string'
          ? (
            conversation.matched_role === 'user'
              ? 'You'
              : conversation.matched_role === 'assistant'
                ? 'Assistant'
                : conversation.matched_role
          )
          : '',
        conversation,
        isPinned: pinnedConversationRefs.includes(conversation?.conversation_id),
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
  }, [pinnedConversationRefs, searchedConversations]);

  useEffect(() => {
    if (!searchOpen) {
      return undefined;
    }

    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setIsSearchingConversations(false);
      setSearchConversationsError('');
      setSearchedConversations([]);
      return undefined;
    }

    let isCancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchingConversations(true);
      setSearchConversationsError('');
      try {
        const result = await IpcBridge.invoke(INVOKE_CHANNELS.SEARCH_CONVERSATIONS, {
          userId: resolvedUserId,
          query: normalizedQuery,
          limit: 60,
        });
        if (isCancelled) {
          return;
        }
        if (!result || result.success === false) {
          throw new Error(result?.error || 'Failed to search chats');
        }

        const list = Array.isArray(result?.data?.conversations)
          ? result.data.conversations
          : [];
        setSearchedConversations(list);
      } catch (error) {
        if (isCancelled) {
          return;
        }
        setSearchedConversations([]);
        setSearchConversationsError(error?.message || 'Failed to search chats');
      } finally {
        if (!isCancelled) {
          setIsSearchingConversations(false);
        }
      }
    }, 180);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchOpen, searchQuery, resolvedUserId]);

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
        openMemory();
      }
    });

    return () => {
      removeListener?.();
    };
  }, [handleChatSurface, openMemory, openModels, openSettings]);

  return (
    <div className={`cg-dashboard-shell${dashboardOpening ? ' cg-dashboard-shell-opening' : ''}`}>
      <DashboardSidebar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleSidebarToggle}
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
        onOpenConversation={handleOpenConversation}
        onRenameConversation={handleRenameConversation}
        onTogglePinConversation={handleTogglePinConversation}
        onDeleteConversation={handleDeleteConversation}
        activeConversationRef={sessionInfo.conversationRef || null}
      />

      <main className={`cg-main-content${sidebarOpen ? '' : ' cg-main-content-collapsed'}`.trim()}>
        <ChatInterface sidebarOpen={sidebarOpen} />
      </main>

      <SearchChatsModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onStartNewChat={handleStartNewChat}
        onOpenConversation={handleOpenConversation}
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
