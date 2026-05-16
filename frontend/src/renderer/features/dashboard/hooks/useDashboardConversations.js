import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  searchStoredConversations,
} from '../../../infrastructure/transcript/localConversationStore';
import { loadLocalConversationSnapshot } from '../../../infrastructure/transcript/conversationLocalSnapshotLoader';
import { buildChatMessagesFromDisplayConversation } from '../../../infrastructure/transcript/sdkDisplayChatMessageProjection';
import { DesktopConversationLibraryClient } from '../../../app/runtime/desktopConversationLibraryClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { setActiveWorkspaceSelection } from '../../../infrastructure/workspace/workspaceAccess';
import {
  clearConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import {
  clearConversationInferenceSessionState,
  markConversationInferenceSessionUnknown,
} from '../../chat/session/conversationInferenceSessionRuntime';
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

  const loadRecentConversations = useCallback(async () => {
    if (typeof resolvedUserId !== 'string' || resolvedUserId.trim().length === 0) {
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
        const list = normalizeRecentConversations(
          (await DesktopConversationLibraryClient.listMetadata(resolvedUserId)).map((metadata) => ({
            conversation_id: metadata.conversationRef,
            record_kind: 'conversation_event',
            title: metadata.title || metadata.conversationRef,
            last_message: metadata.lastMessage || '',
            last_timestamp: metadata.updatedAt,
            entry_count: metadata.eventCount,
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

    setRecentConversationsError('');

    try {
      const snapshot = await loadLocalConversationSnapshot({
        userId: resolvedUserId,
        conversationRef,
        recordKind: 'transcript',
        conversation,
      });
      const displayConversation = await DesktopConversationLibraryClient.loadForDisplay(
        resolvedUserId,
        conversationRef,
      );
      const projectedMessages = buildChatMessagesFromDisplayConversation(displayConversation);
      setConversationWorkspaceBinding(conversationRef, snapshot.workspaceBinding);
      try {
        await setActiveWorkspaceSelection(snapshot.workspaceBinding.workspacePath || null);
      } catch (workspaceError) {
        console.warn('[useDashboardConversations] Failed to sync active workspace:', workspaceError);
      }

      applyRendererConversationSelection({
        conversationRef,
        userId: resolvedUserId,
        updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
        setChatConversationRef: setChatActiveConversationRef,
      });
      if (sessionConversationRef !== conversationRef) {
        markConversationInferenceSessionUnknown(conversationRef);
      }
      setChatMessages(projectedMessages, conversationRef);
      setChatIsSending(false, conversationRef);
      setChatThinkingStatus(null, conversationRef);
    } catch (error) {
      setRecentConversationsError(error?.message || 'Failed to open conversation');
    }
  }, [
    resolvedUserId,
    sessionConversationRef,
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
      await DesktopConversationLibraryClient.deleteConversation(resolvedUserId, conversationRef);

      setRecentConversations((current) => current.filter((item) => item?.conversation_id !== conversationRef));
      setSearchedConversations((current) => current.filter((item) => item?.conversation_id !== conversationRef));
      setPinnedConversationRefs((current) => current.filter((id) => id !== conversationRef));
      clearConversationWorkspaceBinding(conversationRef);
      clearConversationInferenceSessionState(conversationRef);
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
    loadRecentConversations();
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
    const handleTranscriptEntryStored = (event) => {
      const detail = event?.detail;
      const role = typeof detail?.role === 'string' ? detail.role : '';
      const messageType = typeof detail?.messageType === 'string' ? detail.messageType : '';
      const conversationRef = typeof detail?.conversationRef === 'string'
        ? detail.conversationRef
        : '';
      if (role === 'user' && messageType === 'user') {
        void loadRecentConversations();
        return;
      }
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
        const list = await searchStoredConversations({
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
