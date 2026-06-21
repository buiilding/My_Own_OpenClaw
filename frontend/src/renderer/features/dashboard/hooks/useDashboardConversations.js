/**
 * Provides the use dashboard conversations module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DesktopConversationDisplayProjection } from '../../../app/runtime/desktopConversationDisplayProjection';
import { DesktopConversationLibraryClient } from '../../../app/runtime/desktopConversationLibraryClient';
import { DesktopLocalRuntimeStatusRuntimeClient } from '../../../app/runtime/desktopLocalRuntimeStatusRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from '../../../app/runtime/desktopWorkspaceRuntimeClient';
import { DesktopConversationRuntimeEventClient } from '../../../app/runtime/desktopConversationRuntimeEventClient';
import { applyRendererConversationSelection } from '../../../app/runtime/desktopConversationSessionRuntime';
import { DesktopActiveChatSessionRuntime } from '../../../app/runtime/desktopActiveChatSessionRuntime';
import {
  buildConversationGroups,
  buildWorkspaceConversationGroups,
} from '../../../app/runtime/desktopDashboardConversationGroupRuntime';
import {
  DesktopDashboardConversationLoadRuntime,
} from '../../../app/runtime/desktopDashboardConversationLoadRuntime';

const {
  getDashboardConversationRef,
  getDashboardConversationRenamePromptValue,
  getRecentConversationsReloadReasonForEventAction,
  getTitleVisibilityPollSchedule,
  getTitleVisibilityPollConversationRef,
  metadataListToDashboardConversations,
  normalizeRecentConversations,
  prunePinnedConversationRefs,
  removeDashboardConversationFromList,
  removePinnedConversationRef,
  renameDashboardConversationInList,
  resolveRecentConversationEventAction,
  resolveRecentConversationsRetryDelayMs,
  shouldContinueTitleVisibilityPoll,
  shouldRetryRecentConversationsLoad,
  shouldReloadRecentConversationsForEventAction,
  togglePinnedConversationRef,
} = DesktopDashboardConversationLoadRuntime;
const {
  resetActiveChatSession,
} = DesktopActiveChatSessionRuntime;
const {
  buildChatMessagesFromSdkDisplayRows,
} = DesktopConversationDisplayProjection;

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
  const [openingConversationRef, setOpeningConversationRef] = useState(null);
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
      let diagnosticsContext = null;
      try {
        const metadataList = await DesktopConversationLibraryClient.listMetadata(resolvedUserId, {
          userIdSource: 'session',
          onDiagnosticsContext: (context) => {
            diagnosticsContext = context;
          },
        });
        const list = normalizeRecentConversations(metadataListToDashboardConversations(metadataList));

        // Ignore stale loads so older responses cannot overwrite newer user/session state.
        if (recentConversationLoadRequestIdRef.current !== requestId) {
          return list;
        }

        recentConversationsRetryAttemptRef.current = 0;
        setRecentConversations(list);
        setPinnedConversationRefs((current) => prunePinnedConversationRefs(current, list));
        DesktopConversationLibraryClient.emitConversationMetadataListRendered?.(diagnosticsContext, {
          status: 'succeeded',
          resultCount: list.length,
        });

        return list;
      } catch (error) {
        if (recentConversationLoadRequestIdRef.current !== requestId) {
          return [];
        }
        const errorMessage = error?.message || 'Failed to load recent chats';
        setRecentConversationsError(errorMessage);
        DesktopConversationLibraryClient.emitConversationMetadataListRendered?.(diagnosticsContext, {
          status: 'failed',
          error,
        });
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
    const { delayMs } = getTitleVisibilityPollSchedule();

    const poll = async () => {
      attempts += 1;
      const list = await loadRecentConversations();
      if (!shouldContinueTitleVisibilityPoll({
        recentConversations: list,
        conversationRef,
        attempts,
      })) {
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
    const conversationRef = getDashboardConversationRef(conversation);
    if (!conversationRef) {
      return;
    }

    if (conversationRef === activeConversationRef) {
      return;
    }

    setRecentConversationsError('');
    const requestId = openConversationRequestIdRef.current + 1;
    openConversationRequestIdRef.current = requestId;
    setOpeningConversationRef(conversationRef);

    try {
      const cachedWorkspace = typeof getChatWorkspaceState === 'function'
        ? getChatWorkspaceState(conversationRef)
        : null;
      const hasCachedMessages = Array.isArray(cachedWorkspace?.messages)
        && cachedWorkspace.messages.length > 0;
      const workspaceBinding = DesktopWorkspaceRuntimeClient.resolveConversationWorkspaceBinding({
        conversation,
        memories: [],
      });
      DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding(conversationRef, workspaceBinding);
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
        await DesktopWorkspaceRuntimeClient.setActiveWorkspaceSelection(workspaceBinding.workspacePath || null);
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
    } finally {
      if (openConversationRequestIdRef.current === requestId) {
        setOpeningConversationRef(null);
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
    const conversationRef = getDashboardConversationRef(conversation);
    if (!conversationRef) {
      return;
    }
    const currentTitle = getDashboardConversationRenamePromptValue(conversation, '');
    const nextTitleInput = window.prompt(
      'Rename chat',
      getDashboardConversationRenamePromptValue(conversation),
    );
    if (typeof nextTitleInput !== 'string') {
      return;
    }
    const nextTitle = nextTitleInput.trim();
    if (!nextTitle || nextTitle === currentTitle) {
      return;
    }
    setRecentConversations((current) => renameDashboardConversationInList(
      current,
      conversationRef,
      nextTitle,
    ));
    setSearchedConversations((current) => renameDashboardConversationInList(
      current,
      conversationRef,
      nextTitle,
    ));
  }, []);

  const handleTogglePinConversation = useCallback((conversation) => {
    const conversationRef = getDashboardConversationRef(conversation);
    if (!conversationRef) {
      return;
    }
    setPinnedConversationRefs((current) => togglePinnedConversationRef(current, conversationRef));
  }, []);

  const handleDeleteConversation = useCallback(async (conversation) => {
    const conversationRef = getDashboardConversationRef(conversation);
    if (!conversationRef) {
      return;
    }
    const shouldDelete = window.confirm('Delete this chat? This cannot be undone.');
    if (!shouldDelete) {
      return;
    }

    try {
      await DesktopConversationLibraryClient.deleteConversation(resolvedUserId, conversationRef);

      setRecentConversations((current) => removeDashboardConversationFromList(current, conversationRef));
      setSearchedConversations((current) => removeDashboardConversationFromList(current, conversationRef));
      setPinnedConversationRefs((current) => removePinnedConversationRef(current, conversationRef));
      DesktopWorkspaceRuntimeClient.clearConversationWorkspaceBinding(conversationRef);
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
    const unsubscribe = DesktopLocalRuntimeStatusRuntimeClient.onReady(() => {
      void loadRecentConversations('local-runtime-ready');
    });
    return unsubscribe;
  }, [loadRecentConversations]);

  useEffect(() => {
    const retryAttempt = recentConversationsRetryAttemptRef.current;
    if (!shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations,
      recentConversationsCount: recentConversations.length,
      recentConversationsError,
      retryAttempt,
      isTransientError: DesktopConversationLibraryClient.isTransientMetadataListError,
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
    const removeListener = DesktopConversationRuntimeEventClient.onConversationEvent((event) => {
      const action = resolveRecentConversationEventAction(event);
      if (shouldReloadRecentConversationsForEventAction(action)) {
        void loadRecentConversations(getRecentConversationsReloadReasonForEventAction(action));
        return;
      }
      const conversationRef = getTitleVisibilityPollConversationRef(action);
      if (!conversationRef) {
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
    setRecentConversationsError,
    resetSearch,
  };
}

export { useDashboardConversations };
