import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { loadConversationTranscriptMemories } from '../../../infrastructure/transcript/conversationTranscriptLoader';
import {
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import {
  parseMemoriesToMessages,
  toRehydrateMessagePayload,
} from '../utils/episodicMemoryUtils';
import { buildConversationGroups } from '../utils/conversationGroups';

function useDashboardConversations({
  resolvedUserId,
  sessionConversationRef,
  setChatMessages,
  setChatIsSending,
  setChatThinkingStatus,
  setChatActiveConversationRef,
  searchOpen,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedConversations, setSearchedConversations] = useState([]);
  const [isSearchingConversations, setIsSearchingConversations] = useState(false);
  const [searchConversationsError, setSearchConversationsError] = useState('');
  const [recentConversations, setRecentConversations] = useState([]);
  const [pinnedConversationRefs, setPinnedConversationRefs] = useState([]);
  const [isLoadingRecentConversations, setIsLoadingRecentConversations] = useState(false);
  const [recentConversationsError, setRecentConversationsError] = useState('');
  const pendingTitlePollTimersRef = useRef(new Map());

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
    const maxAttempts = 240;
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

    setRecentConversationsError('');

    try {
      const memories = await loadConversationTranscriptMemories({
        userId: resolvedUserId,
        conversationRef,
        recordKind: conversation?.record_kind || 'transcript',
      });
      const parsedMessages = parseMemoriesToMessages(memories);

      await ApiClient.sendRehydrateConversation(
        conversationRef,
        memories.map(toRehydrateMessagePayload),
      );

      setActiveConversationRef(conversationRef);
      updateTranscriptSession(conversationRef, resolvedUserId);
      setChatActiveConversationRef(conversationRef);
      setChatMessages(parsedMessages, conversationRef);
      setChatIsSending(false, conversationRef);
      setChatThinkingStatus(null, conversationRef);
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to open conversation');
    }
  }, [
    resolvedUserId,
    setChatActiveConversationRef,
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
      if (sessionConversationRef === conversationRef) {
        setActiveConversationRef(null);
        updateTranscriptSession(null, resolvedUserId);
        setChatActiveConversationRef(null);
        setChatMessages([], null);
        setChatIsSending(false, null);
        setChatThinkingStatus(null, null);
      }
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to delete chat');
    }
  }, [
    resolvedUserId,
    sessionConversationRef,
    setChatActiveConversationRef,
    setChatIsSending,
    setChatMessages,
    setChatThinkingStatus,
  ]);

  const recentConversationGroups = useMemo(() => (
    buildConversationGroups(recentConversations, {
      pinnedConversationRefs,
      keyPrefix: 'conversation',
    })
  ), [pinnedConversationRefs, recentConversations]);

  const searchedConversationGroups = useMemo(() => (
    buildConversationGroups(searchedConversations, {
      pinnedConversationRefs,
      keyPrefix: 'search-conversation',
      includeSearchMetadata: true,
    })
  ), [pinnedConversationRefs, searchedConversations]);

  const resetSearch = useCallback(() => {
    setSearchQuery('');
    setSearchedConversations([]);
    setSearchConversationsError('');
    setIsSearchingConversations(false);
  }, []);

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
    const pendingTimers = pendingTitlePollTimersRef.current;
    return () => {
      for (const timerId of pendingTimers.values()) {
        window.clearTimeout(timerId);
      }
      pendingTimers.clear();
    };
  }, []);

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

  return {
    searchQuery,
    searchedConversations,
    isSearchingConversations,
    searchConversationsError,
    recentConversations,
    pinnedConversationRefs,
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
    setRecentConversationsError,
    resetSearch,
  };
}

export { useDashboardConversations };
