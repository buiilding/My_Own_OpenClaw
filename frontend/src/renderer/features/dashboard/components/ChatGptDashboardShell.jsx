import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  DEFAULT_USER_ID,
  parseMemoriesToMessages,
  toRehydrateMessagePayload,
} from '../utils/episodicMemoryUtils';
import DashboardSidebar from './DashboardSidebar';
import { useTranscriptSessionInfo } from '../hooks/useTranscriptSessionInfo';
import MemorySection from './sections/MemorySection';

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
  const [recentConversations, setRecentConversations] = useState([]);
  const [isLoadingRecentConversations, setIsLoadingRecentConversations] = useState(false);
  const [recentConversationsError, setRecentConversationsError] = useState('');
  const sessionInfo = useTranscriptSessionInfo();

  const setChatMessages = useChatStore((state) => state.setMessages);
  const setChatIsSending = useChatStore((state) => state.setIsSending);
  const setChatThinkingStatus = useChatStore((state) => state.setThinkingStatus);

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

  const openMemory = useCallback(() => {
    closeAllPanels();
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
    openMemory();
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

  const handleOpenConversation = useCallback(async (conversation) => {
    const conversationRef = conversation?.conversation_id;
    if (!conversationRef) {
      return;
    }

    closeAllPanels();
    setRecentConversationsError('');

    try {
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_CONVERSATION, {
        userId: DEFAULT_USER_ID,
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
      updateTranscriptSession(conversationRef, DEFAULT_USER_ID);
      setChatMessages(parsedMessages);
      setChatIsSending(false);
      setChatThinkingStatus(null);
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to open conversation');
    }
  }, [
    closeAllPanels,
    setChatIsSending,
    setChatMessages,
    setChatThinkingStatus,
  ]);

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
      const item = {
        key: conversation?.conversation_id || `conversation-${index}`,
        title: `Conversation ${index + 1}`,
        conversation,
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
        openMemory();
      }
    });

    return () => {
      removeListener?.();
    };
  }, [handleChatSurface, openMemory, openModels, openSettings]);

  return (
    <div className="cg-dashboard-shell">
      <DashboardSidebar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleSidebarToggle}
        onStartNewChat={handleStartNewChat}
        onChatSurface={handleChatSurface}
        onOpenMemory={handleMemorySurface}
        onOpenModels={openModels}
        onOpenSettings={openSettings}
        memoryOpen={memoryOpen}
        modelsOpen={modelsOpen}
        isLoadingRecentConversations={isLoadingRecentConversations}
        recentConversationsError={recentConversationsError}
        recentConversationGroups={recentConversationGroups}
        onOpenConversation={handleOpenConversation}
        activeConversationRef={sessionInfo.conversationRef || null}
      />

      <main className={`cg-main-content${sidebarOpen ? '' : ' cg-main-content-collapsed'}`.trim()}>
        <ChatInterface sidebarOpen={sidebarOpen} />
      </main>

      <DashboardModal isOpen={memoryOpen} onClose={() => setMemoryOpen(false)}>
        <div className="cg-panel-wrapper">
          <MemorySection />
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
