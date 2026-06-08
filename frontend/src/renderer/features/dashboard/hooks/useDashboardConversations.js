import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildChatMessagesFromSdkDisplayRows } from '../../../infrastructure/transcript/sdkDisplayChatMessageProjection';
import { DesktopConversationLibraryClient } from '../../../app/runtime/desktopConversationLibraryClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  getLocalBackendStatusSnapshot,
  subscribeLocalBackendStatusStore,
} from '../../../infrastructure/runtime/localBackendStatusStore';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { setActiveWorkspaceSelection } from '../../../infrastructure/workspace/workspaceAccess';
import {
  clearConversationWorkspaceBinding,
  resolveConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import { applyRendererConversationSelection } from '../../chat/session/conversationSessionRuntime';
import { resetActiveChatSession } from '../../chat/utils/session/resetActiveChatSession';
import {
  buildConversationGroups,
  buildWorkspaceConversationGroups,
} from '../utils/conversationGroups';
import {
  normalizeRecentConversations,
  prunePinnedConversationRefs,
  resolveRecentConversationsRetryDelayMs,
  shouldRetryRecentConversationsLoad,
} from '../utils/dashboardConversationLoad';

function useDashboardConversations({
  resolvedUserId,
  sessionConversationRef,
  activeConversationRef,
  getChatWorkspaceState,
  clearChatMessages,
  setChatMessages,
  setChatIsSending,
  setChatThinkingStatus,
  setChatTokenCounts,
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
  const recentConversationsRetryAttemptRef = useRef(0);
  const recentConversationLoadRequestIdRef = useRef(0);
  const recentConversationLoadInFlightRef = useRef(null);
  const openConversationRequestIdRef = useRef(0);

  const loadRecentConversations = useCallback(async () => {
    if (typeof resolvedUserId !== 'string' || resolvedUserId.trim().length === 0) {
      recentConversationLoadRequestIdRef.current += 1;
      recentConversationLoadInFlightRef.current = null;
      recentConversationsRetryAttemptRef.current = 0;
      setRecentConversations([]);
      setPinnedConversationRefs([]);
      setIsLoadingRecentConversations(false);
      setRecentConversationsError('');
      return [];
    }

    const activeLoad = recentConversationLoadInFlightRef.current;
    if (activeLoad && activeLoad.userId === resolvedUserId) {
      return activeLoad.promise;
    }

    const requestId = recentConversationLoadRequestIdRef.current + 1;
    recentConversationLoadRequestIdRef.current = requestId;
    setIsLoadingRecentConversations(true);
    setRecentConversationsError('');

    const loadMarker = {};
    const requestPromise = (async () => {
      try {
        const metadataList = await DesktopConversationLibraryClient.listMetadata(resolvedUserId);
        const list = normalizeRecentConversations(
          metadataList.map((metadata) => ({
            conversation_id: metadata.conversationRef,
            record_kind: 'chat_event',
            title: metadata.title || metadata.conversationRef,
            last_message: metadata.lastMessage || '',
            last_timestamp: metadata.updatedAt,
            entry_count: metadata.eventCount,
            workspace_path: metadata.workspacePath || '',
            workspace_name: metadata.workspaceName || '',
          })),
        );

        // Ignore stale loads so older responses cannot overwrite newer user/session state.
        if (recentConversationLoadRequestIdRef.current !== requestId) {
          return list;
        }

        recentConversationsRetryAttemptRef.current = 0;
        setRecentConversations(list);
        setPinnedConversationRefs((current) => prunePinnedConversationRefs(current, list));

        return list;
      } catch (error) {
        if (recentConversationLoadRequestIdRef.current !== requestId) {
          return [];
        }
        const errorMessage = error?.message || 'Failed to load recent chats';
        setRecentConversationsError(errorMessage);
        return [];
      } finally {
        if (recentConversationLoadRequestIdRef.current === requestId) {
          setIsLoadingRecentConversations(false);
        }
        const inFlightLoad = recentConversationLoadInFlightRef.current;
        if (inFlightLoad?.marker === loadMarker) {
          recentConversationLoadInFlightRef.current = null;
        }
      }
    })();

    recentConversationLoadInFlightRef.current = {
      userId: resolvedUserId,
      marker: loadMarker,
      promise: requestPromise,
    };

    return requestPromise;
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

    if (conversationRef === activeConversationRef) {
      return;
    }

    setRecentConversationsError('');
    const requestId = openConversationRequestIdRef.current + 1;
    openConversationRequestIdRef.current = requestId;

    try {
      const cachedWorkspace = typeof getChatWorkspaceState === 'function'
        ? getChatWorkspaceState(conversationRef)
        : null;
      const hasCachedMessages = Array.isArray(cachedWorkspace?.messages)
        && cachedWorkspace.messages.length > 0;
      const workspaceBinding = resolveConversationWorkspaceBinding({
        conversation,
        memories: [],
      });
      setConversationWorkspaceBinding(conversationRef, workspaceBinding);
      applyRendererConversationSelection({
        conversationRef,
        userId: resolvedUserId,
        updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
        setChatConversationRef: setChatActiveConversationRef,
      });
      if (!hasCachedMessages) {
        clearChatMessages(conversationRef);
        setChatIsSending(false, conversationRef);
        setChatThinkingStatus(null, conversationRef);
        setChatTokenCounts(null, conversationRef);
      }

      const displayRows = await DesktopConversationLibraryClient.loadDisplayRows(
        resolvedUserId,
        conversationRef,
      );
      if (openConversationRequestIdRef.current !== requestId) {
        return;
      }
      const projectedMessages = buildChatMessagesFromSdkDisplayRows(displayRows);
      try {
        await setActiveWorkspaceSelection(workspaceBinding.workspacePath || null);
      } catch (workspaceError) {
        console.warn('[useDashboardConversations] Failed to sync active workspace:', workspaceError);
      }

      setChatMessages(projectedMessages, conversationRef);
      setChatIsSending(false, conversationRef);
      setChatThinkingStatus(null, conversationRef);
      setChatTokenCounts(null, conversationRef);
    } catch (error) {
      if (openConversationRequestIdRef.current === requestId) {
        setRecentConversationsError(error?.message || 'Failed to open conversation');
      }
    }
  }, [
    clearChatMessages,
    activeConversationRef,
    getChatWorkspaceState,
    resolvedUserId,
    setChatActiveConversationRef,
    setChatIsSending,
    setChatMessages,
    setChatThinkingStatus,
    setChatTokenCounts,
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
      await DesktopConversationLibraryClient.deleteConversation(resolvedUserId, conversationRef);

      setRecentConversations((current) => current.filter((item) => item?.conversation_id !== conversationRef));
      setSearchedConversations((current) => current.filter((item) => item?.conversation_id !== conversationRef));
      setPinnedConversationRefs((current) => current.filter((id) => id !== conversationRef));
      clearConversationWorkspaceBinding(conversationRef);
      if (sessionConversationRef === conversationRef) {
        resetActiveChatSession({
          conversationRef,
          userId: resolvedUserId,
          clearMessages: clearChatMessages,
          setIsSending: setChatIsSending,
          setThinkingStatus: setChatThinkingStatus,
          setTokenCounts: setChatTokenCounts,
          setChatActiveConversationRef,
        });
      }
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to delete chat');
    }
  }, [
    clearChatMessages,
    resolvedUserId,
    sessionConversationRef,
    setChatActiveConversationRef,
    setChatIsSending,
    setChatThinkingStatus,
    setChatTokenCounts,
  ]);

  const recentConversationGroups = useMemo(() => (
    buildConversationGroups(recentConversations, {
      pinnedConversationRefs,
      keyPrefix: 'conversation',
    })
  ), [pinnedConversationRefs, recentConversations]);

  const recentWorkspaceGroups = useMemo(() => (
    buildWorkspaceConversationGroups(recentConversations, {
      pinnedConversationRefs,
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
    loadRecentConversations('mount');
  }, [loadRecentConversations]);

  useEffect(() => {
    const reloadWhenLocalBackendReady = () => {
      const snapshot = getLocalBackendStatusSnapshot();
      if (snapshot.ready === true) {
        void loadRecentConversations('local-backend-ready');
      }
    };

    const unsubscribe = subscribeLocalBackendStatusStore(reloadWhenLocalBackendReady);
    reloadWhenLocalBackendReady();
    return unsubscribe;
  }, [loadRecentConversations]);

  useEffect(() => {
    const retryAttempt = recentConversationsRetryAttemptRef.current;
    if (!shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations,
      recentConversationsCount: recentConversations.length,
      recentConversationsError,
      retryAttempt,
    })) {
      return undefined;
    }
    const retryDelayMs = resolveRecentConversationsRetryDelayMs(retryAttempt);
    recentConversationsRetryAttemptRef.current += 1;

    const timerId = window.setTimeout(() => {
      void loadRecentConversations();
    }, retryDelayMs);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    isLoadingRecentConversations,
    loadRecentConversations,
    recentConversations.length,
    recentConversationsError,
  ]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.WINDIE_CONVERSATION_EVENT, (event) => {
      const eventType = typeof event?.type === 'string' ? event.type : '';
      const conversationRef = typeof event?.conversationRef === 'string'
        ? event.conversationRef
        : '';
      if (eventType === 'user_message') {
        void loadRecentConversations('sdk-user-message');
        return;
      }
      if (eventType !== 'assistant_message') {
        return;
      }
      if (!conversationRef) {
        void loadRecentConversations('sdk-assistant-message-no-conversation');
        return;
      }
      scheduleTitleVisibilityPoll(conversationRef);
    });

    return () => {
      removeListener?.();
    };
  }, [loadRecentConversations, scheduleTitleVisibilityPoll]);

  useEffect(() => {
    const unsubscribe = DesktopConversationLibraryClient.subscribeMetadataInvalidations(() => {
      void loadRecentConversations();
    });
    return () => {
      unsubscribe?.();
    };
  }, [loadRecentConversations]);

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

    if (typeof resolvedUserId !== 'string' || resolvedUserId.trim().length === 0) {
      setIsSearchingConversations(false);
      setSearchConversationsError('');
      setSearchedConversations([]);
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
        const list = await DesktopConversationLibraryClient.searchConversations({
          userId: resolvedUserId,
          query: normalizedQuery,
          limit: 60,
        });
        if (isCancelled) {
          return;
        }
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
    recentWorkspaceGroups,
    searchedConversationGroups,
    setSearchQuery,
    setRecentConversationsError,
    resetSearch,
  };
}

export { useDashboardConversations };
