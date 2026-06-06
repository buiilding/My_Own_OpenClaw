import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChatStore } from '../../chat/stores/chatStore';
import { useChatMessageSender } from '../../chat/hooks/useChatMessageSender';
import { useChatComposerDraft } from '../../chat/hooks/useChatComposerDraft';
import { useRendererConversationSessionInfo } from '../../chat/session/useRendererConversationSessionInfo';
import { DesktopLiveTurnRuntimeClient } from '../../../app/runtime/desktopLiveTurnRuntimeClient';
import { IpcBridge, INVOKE_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  useChatboxDragWindowBindings,
  useChatboxFocusBindings,
  useChatboxVisualAnchorBindings,
  useChatboxWakewordSttTriggerBinding,
} from '../hooks/useMinimalChatPillBindings';
import { useTextareaAutoResize } from '../../chat/hooks/useMessageInputUiBindings';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import { isDevUiEnabled } from '../../chat/utils/devUiFlag';
import {
  CHATBOX_WINDOW_FRAME_HEIGHT_PADDING,
  resolveChatboxVisualAnchorHeight,
} from '../../chat/utils/state/chatBoxState';
import {
  logRendererChatPillTrace,
  logRendererLiveSurfaceTrace,
} from '../../chat/utils/chatStream/chatStreamDebugTrace';
import {
  createChatboxDragState,
  getChatboxCloseBumpHeight,
  getChatboxDragTarget,
  startChatboxDrag,
  stopChatboxDrag,
} from '../utils/minimalChatPillLayout';
import { useChatSurfaceController } from '../../chat/hooks/useChatSurfaceController';
import {
  AttachmentIcon,
  CompactIcon,
  CloseIcon,
  ScreenshotIcon,
  SendIcon,
  SettingsIcon,
  SoundIcon,
  StopIcon,
} from './PillIcons';
import AttachmentPreviewRow from './AttachmentPreviewRow';
import { applyStopQueryUiState } from '../../chat/utils/state/stopQueryState';

const CHATBOX_COMPOSER_MAX_HEIGHT = 128;
const CHATBOX_NATIVE_FRAME_COLLAPSE_DELAY_MS = 180;
const CHATBOX_COMPOSER_MAX_HEIGHT_EPSILON = 1;
const COMPOSER_SIZE_STATE = Object.freeze({
  COMPACT: 'compact',
  EXPANDED: 'expanded',
  EXPANDED_CLAMPED: 'expanded-clamped',
  COLLAPSE_FREEZE: 'collapse-freeze',
  COLLAPSE_RELEASE: 'collapse-release',
});

function measureComposerContentMetrics(inputElement) {
  if (!inputElement) {
    return {
      height: 0,
      isClamped: false,
      maxHeight: CHATBOX_COMPOSER_MAX_HEIGHT,
      minHeight: 1,
      rawHeight: 0,
    };
  }

  const computedStyle = (
    typeof window !== 'undefined'
    && typeof window.getComputedStyle === 'function'
  )
    ? window.getComputedStyle(inputElement)
    : null;
  const minHeight = Math.max(1, Math.round(Number.parseFloat(computedStyle?.minHeight) || 0));
  const maxHeight = Math.max(
    minHeight,
    Math.round(Number.parseFloat(computedStyle?.maxHeight) || CHATBOX_COMPOSER_MAX_HEIGHT),
  );

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    const rawHeight = Math.max(minHeight, Math.round(Number(inputElement.scrollHeight) || 0));
    return {
      height: Math.max(minHeight, Math.min(rawHeight, maxHeight)),
      isClamped: rawHeight > maxHeight + CHATBOX_COMPOSER_MAX_HEIGHT_EPSILON,
      maxHeight,
      minHeight,
      rawHeight,
    };
  }

  const rect = inputElement.getBoundingClientRect?.();
  const measuredWidth = Math.max(
    1,
    Math.round(Number(rect?.width) || Number(inputElement.offsetWidth) || 0),
  );
  const measurementElement = document.createElement('textarea');
  measurementElement.className = inputElement.className;
  measurementElement.value = inputElement.value || '';
  measurementElement.rows = inputElement.rows || 1;
  measurementElement.setAttribute('aria-hidden', 'true');
  measurementElement.tabIndex = -1;
  measurementElement.style.position = 'fixed';
  measurementElement.style.left = '-10000px';
  measurementElement.style.top = '0';
  measurementElement.style.width = `${measuredWidth}px`;
  measurementElement.style.height = 'auto';
  measurementElement.style.minHeight = '0';
  measurementElement.style.maxHeight = 'none';
  measurementElement.style.overflow = 'hidden';
  measurementElement.style.visibility = 'hidden';
  measurementElement.style.pointerEvents = 'none';
  measurementElement.style.contain = 'layout style';

  if (computedStyle) {
    [
      'borderBottomWidth',
      'borderLeftWidth',
      'borderRightWidth',
      'borderTopWidth',
      'boxSizing',
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'paddingBottom',
      'paddingLeft',
      'paddingRight',
      'paddingTop',
      'textTransform',
      'wordSpacing',
    ].forEach((propertyName) => {
      measurementElement.style[propertyName] = computedStyle[propertyName];
    });
  }

  document.body.appendChild(measurementElement);
  const measuredHeight = Math.max(minHeight, Math.round(Number(measurementElement.scrollHeight) || 0));
  measurementElement.remove();
  return {
    height: Math.max(minHeight, Math.min(measuredHeight, maxHeight)),
    isClamped: measuredHeight > maxHeight + CHATBOX_COMPOSER_MAX_HEIGHT_EPSILON,
    maxHeight,
    minHeight,
    rawHeight: measuredHeight,
  };
}

function MinimalChatPill() {
  const closeBumpHeight = getChatboxCloseBumpHeight();
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const currentTurnProjection = useChatStore((state) => (
    state.latestCurrentTurnProjection || state.currentTurnProjection
  ));
  const sessionInfo = useRendererConversationSessionInfo();
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const [wakewordSttSessionActive, setWakewordSttSessionActive] = useState(false);
  const [reservedChatboxFrameHeight, setReservedChatboxFrameHeight] = useState(null);
  const [composerSizeState, setComposerSizeState] = useState(COMPOSER_SIZE_STATE.COMPACT);
  const [composerCollapseSnapshot, setComposerCollapseSnapshot] = useState(null);
  const inputRef = useRef(null);
  const pillRef = useRef(null);
  const shellRef = useRef(null);
  const sendButtonRef = useRef(null);
  const closeButtonAnchorFrameRef = useRef(null);
  const closeButtonAnchorSnapshotRef = useRef({ centerX: null });
  const composerResizeSequenceRef = useRef(0);
  const composerSizeStateRef = useRef(COMPOSER_SIZE_STATE.COMPACT);
  const composerCollapseSnapshotRef = useRef(null);
  const composerCollapseFrameRef = useRef(null);
  const reservedChatboxFrameHeightRef = useRef(null);
  const nativeFrameCollapseTimeoutRef = useRef(null);
  const lastLoggedPillStateRef = useRef('');
  const lifecycleTraceSnapshotRef = useRef({
    conversationRef: null,
    turnRef: null,
    phase: null,
  });
  const dragStateRef = useRef(createChatboxDragState());
  const chatboxHitTestActiveRef = useRef(null);
  const chatSurface = useChatSurfaceController({
    isSending,
    messages,
    currentTurnProjection,
    sessionInfo,
    setThinkingStatus,
    setThinkingSourceEventType,
    warningContext: 'MinimalChatPill',
  });
  const {
    includeQueryScreenshot,
    isBusy: loopInteractionLocked,
    liveTurnPhase,
    liveTurnSource,
    speechModeEnabled,
    wakewordSttEnabled,
  } = chatSurface;
  const devUiEnabled = isDevUiEnabled();
  lifecycleTraceSnapshotRef.current = {
    conversationRef: sessionInfo?.conversationRef || null,
    turnRef: currentTurnProjection?.turnRef || null,
    phase: currentTurnProjection?.phase || null,
  };
  const {
    attachmentInputRef,
    clipboardImages,
    selectedReadableFiles,
    inputValue,
    setInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handleComposerPaste,
    handleAttachmentSelection,
    submitMessageValue,
    setClipboardImages,
    setSelectedReadableFiles,
    hasAttachments,
  } = useChatComposerDraft({
    isSubmitBlocked: loopInteractionLocked,
    onSendMessage: sendMessage,
    onBeforeSend: () => {
      logRendererLiveSurfaceTrace('turn_surface.reset', {
        source: 'minimal-chat-pill',
        reason: 'user-send',
        conversationRef: sessionInfo?.conversationRef || null,
        previousTurnRef: currentTurnProjection?.turnRef || null,
        previousPhase: currentTurnProjection?.phase || null,
        attachmentCount: clipboardImages.length + selectedReadableFiles.length,
        includeQueryScreenshot,
      }, sessionInfo?.conversationRef || null);
      setWakewordSttSessionActive(false);
    },
  });
  const hasAttachmentPreview = hasAttachments;

  useEffect(() => {
    reservedChatboxFrameHeightRef.current = reservedChatboxFrameHeight;
  }, [reservedChatboxFrameHeight]);

  useEffect(() => {
    composerSizeStateRef.current = composerSizeState;
  }, [composerSizeState]);

  useEffect(() => {
    composerCollapseSnapshotRef.current = composerCollapseSnapshot;
  }, [composerCollapseSnapshot]);

  const setComposerSizeStateValue = useCallback((nextState) => {
    if (composerSizeStateRef.current === nextState) {
      return;
    }
    composerSizeStateRef.current = nextState;
    setComposerSizeState(nextState);
  }, []);

  const clearNativeFrameCollapse = useCallback(() => {
    if (nativeFrameCollapseTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout?.(nativeFrameCollapseTimeoutRef.current);
    nativeFrameCollapseTimeoutRef.current = null;
  }, []);

  const clearComposerCollapseFrame = useCallback(() => {
    if (composerCollapseFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame?.(composerCollapseFrameRef.current);
    composerCollapseFrameRef.current = null;
  }, []);

  const resolveNativeFrameHeightForShellHeight = useCallback((shellHeight) => {
    const anchorHeight = resolveChatboxVisualAnchorHeight({
      hasImagePreview: hasAttachmentPreview,
      shellHeight,
    });
    return anchorHeight + CHATBOX_WINDOW_FRAME_HEIGHT_PADDING;
  }, [hasAttachmentPreview]);

  const setReservedNativeFrameHeight = useCallback((nextFrameHeight) => {
    const normalizedFrameHeight = Math.max(1, Math.round(Number(nextFrameHeight) || 0));
    if (reservedChatboxFrameHeightRef.current === normalizedFrameHeight) {
      return;
    }
    reservedChatboxFrameHeightRef.current = normalizedFrameHeight;
    setReservedChatboxFrameHeight(normalizedFrameHeight);
  }, []);

  const applyComposerHeight = useCallback((height) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.style.height = `${height}px`;
  }, []);

  const createComposerCollapseSnapshot = useCallback(() => {
    const shellHeight = Math.max(
      1,
      Math.round(shellRef.current?.offsetHeight || 0),
    );
    const pillHeight = Math.max(
      1,
      Math.round(pillRef.current?.offsetHeight || shellHeight),
    );
    const anchorHeight = resolveChatboxVisualAnchorHeight({
      hasImagePreview: hasAttachmentPreview,
      shellHeight,
    });
    const frameHeight = Math.max(
      resolveNativeFrameHeightForShellHeight(shellHeight),
      reservedChatboxFrameHeightRef.current || 0,
    );
    return {
      anchorHeight,
      frameHeight,
      pillHeight,
      shellHeight,
    };
  }, [hasAttachmentPreview, resolveNativeFrameHeightForShellHeight]);

  const setComposerCollapseSnapshotValue = useCallback((snapshot) => {
    composerCollapseSnapshotRef.current = snapshot;
    setComposerCollapseSnapshot(snapshot);
  }, []);

  const resolveComposerSizeStateForMetrics = useCallback((metrics, isEmptyComposer) => {
    if (isEmptyComposer || metrics.height <= metrics.minHeight + CHATBOX_COMPOSER_MAX_HEIGHT_EPSILON) {
      return COMPOSER_SIZE_STATE.COMPACT;
    }
    return metrics.isClamped
      ? COMPOSER_SIZE_STATE.EXPANDED_CLAMPED
      : COMPOSER_SIZE_STATE.EXPANDED;
  }, []);

  const scheduleNativeFrameCollapse = useCallback((onCollapse = null) => {
    clearNativeFrameCollapse();
    nativeFrameCollapseTimeoutRef.current = window.setTimeout(() => {
      nativeFrameCollapseTimeoutRef.current = null;
      if ((inputRef.current?.value || '').trim() || hasAttachmentPreview) {
        return;
      }
      const shellHeight = shellRef.current?.offsetHeight ?? null;
      const nextAnchorHeight = resolveChatboxVisualAnchorHeight({
        hasImagePreview: hasAttachmentPreview,
        shellHeight,
      });
      reservedChatboxFrameHeightRef.current = null;
      setReservedChatboxFrameHeight(null);
      onCollapse?.();
      IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, {
        height: nextAnchorHeight,
      }).catch((error) => {
        console.warn('[MinimalChatPill] Failed to collapse chat window frame:', error);
      });
    }, CHATBOX_NATIVE_FRAME_COLLAPSE_DELAY_MS);
  }, [clearNativeFrameCollapse, hasAttachmentPreview]);

  const finishComposerCollapse = useCallback(() => {
    setComposerCollapseSnapshotValue(null);
    setComposerSizeStateValue(COMPOSER_SIZE_STATE.COMPACT);
  }, [setComposerCollapseSnapshotValue, setComposerSizeStateValue]);

  const runClampedComposerCollapse = useCallback(({
    nextHeight,
    sequence,
    snapshot,
  }) => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    clearNativeFrameCollapse();
    clearComposerCollapseFrame();
    setComposerCollapseSnapshotValue(snapshot);
    setComposerSizeStateValue(COMPOSER_SIZE_STATE.COLLAPSE_FREEZE);
    setReservedNativeFrameHeight(snapshot.frameHeight);
    inputElement.scrollTop = 0;
    applyComposerHeight(CHATBOX_COMPOSER_MAX_HEIGHT);

    const scheduleNextFrame = (callback) => {
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        callback();
        return;
      }
      composerCollapseFrameRef.current = window.requestAnimationFrame(() => {
        composerCollapseFrameRef.current = null;
        callback();
      });
    };

    scheduleNextFrame(() => {
      if (composerResizeSequenceRef.current !== sequence) {
        return;
      }
      setComposerSizeStateValue(COMPOSER_SIZE_STATE.COLLAPSE_RELEASE);
      scheduleNextFrame(() => {
        if (composerResizeSequenceRef.current !== sequence) {
          return;
        }
        inputRef.current?.style.setProperty('height', `${nextHeight}px`);
        if (inputRef.current) {
          inputRef.current.scrollTop = 0;
        }
        scheduleNativeFrameCollapse(() => {
          if (composerResizeSequenceRef.current === sequence) {
            finishComposerCollapse();
          }
        });
      });
    });
  }, [
    applyComposerHeight,
    clearComposerCollapseFrame,
    clearNativeFrameCollapse,
    finishComposerCollapse,
    scheduleNativeFrameCollapse,
    setComposerCollapseSnapshotValue,
    setComposerSizeStateValue,
    setReservedNativeFrameHeight,
  ]);

  useEffect(() => {
    return () => {
      clearNativeFrameCollapse();
      clearComposerCollapseFrame();
    };
  }, [clearComposerCollapseFrame, clearNativeFrameCollapse]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
    const textLength = inputRef.current?.value?.length || 0;
    inputRef.current?.setSelectionRange?.(textLength, textLength);
  }, []);

  useChatboxFocusBindings(focusInput);
  useChatboxWakewordSttTriggerBinding({
    wakewordSttEnabled,
    resetTranscription,
    setInputValue,
    setWakewordSttSessionActive,
    focusInput,
  });

  useEffect(() => {
    if (!wakewordSttEnabled && wakewordSttSessionActive) {
      setWakewordSttSessionActive(false);
    }
  }, [wakewordSttEnabled, wakewordSttSessionActive]);

  useEffect(() => {
    const initialSnapshot = lifecycleTraceSnapshotRef.current;
    logRendererLiveSurfaceTrace('renderer.chat_pill.mount', {
      source: 'minimal-chat-pill',
      conversationRef: initialSnapshot.conversationRef,
      turnRef: initialSnapshot.turnRef,
      phase: initialSnapshot.phase,
    }, initialSnapshot.conversationRef);
    return () => {
      const latestSnapshot = lifecycleTraceSnapshotRef.current;
      logRendererLiveSurfaceTrace('renderer.chat_pill.unmount', {
        source: 'minimal-chat-pill',
        conversationRef: latestSnapshot.conversationRef,
        turnRef: latestSnapshot.turnRef,
        phase: latestSnapshot.phase,
      }, latestSnapshot.conversationRef);
    };
  }, []);

  useEffect(() => {
    const nextPillStateSignature = JSON.stringify({
      isSending,
      loopInteractionLocked,
      liveTurnPhase,
      liveTurnSource,
      currentTurnPhase: currentTurnProjection?.phase || null,
      currentTurnRef: currentTurnProjection?.turnRef || null,
    });
    if (lastLoggedPillStateRef.current === nextPillStateSignature) {
      return;
    }
    lastLoggedPillStateRef.current = nextPillStateSignature;
    logRendererChatPillTrace({
      source: 'renderer-chat-pill-state',
      action: 'state-changed',
      conversation_ref: sessionInfo?.conversationRef || null,
      turn_id: currentTurnProjection?.turnRef || null,
      current_turn_phase: currentTurnProjection?.phase || null,
      live_turn_phase: liveTurnPhase,
      live_turn_source: liveTurnSource,
      is_sending: isSending,
      busy: loopInteractionLocked,
      stop_available: loopInteractionLocked,
      message_count: messages.length,
    }, sessionInfo?.conversationRef || null);
  }, [
    currentTurnProjection?.phase,
    currentTurnProjection?.turnRef,
    isSending,
    liveTurnPhase,
    liveTurnSource,
    loopInteractionLocked,
    messages.length,
    sessionInfo?.conversationRef,
  ]);

  const resizeComposer = useCallback(() => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    const currentHeight = Math.max(
      1,
      Math.round(inputElement.getBoundingClientRect?.().height || inputElement.offsetHeight || 0),
    );
    const composerMetrics = measureComposerContentMetrics(inputElement);
    const nextHeight = composerMetrics.height;
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }

    const sequence = composerResizeSequenceRef.current + 1;
    composerResizeSequenceRef.current = sequence;
    const isEmptyComposer = !inputValue.trim() && !hasAttachmentPreview;
    const currentComposerSizeState = composerSizeStateRef.current;

    if (nextHeight <= currentHeight) {
      const isDeletingFromClampedComposer = (
        isEmptyComposer
        && currentComposerSizeState === COMPOSER_SIZE_STATE.EXPANDED_CLAMPED
        && currentHeight >= composerMetrics.maxHeight - CHATBOX_COMPOSER_MAX_HEIGHT_EPSILON
        && nextHeight < currentHeight
      );
      if (isDeletingFromClampedComposer) {
        runClampedComposerCollapse({
          nextHeight,
          sequence,
          snapshot: createComposerCollapseSnapshot(),
        });
        return;
      }

      clearComposerCollapseFrame();
      setComposerCollapseSnapshotValue(null);
      setComposerSizeStateValue(resolveComposerSizeStateForMetrics(composerMetrics, isEmptyComposer));
      applyComposerHeight(nextHeight);
      if (isEmptyComposer) {
        scheduleNativeFrameCollapse();
      }
      return;
    }

    clearNativeFrameCollapse();
    clearComposerCollapseFrame();
    setComposerCollapseSnapshotValue(null);
    const shellElement = shellRef.current;
    const currentShellHeight = Math.max(
      1,
      Math.round(shellElement?.offsetHeight || 0),
    );
    const currentAnchorHeight = resolveChatboxVisualAnchorHeight({
      hasImagePreview: hasAttachmentPreview,
      shellHeight: currentShellHeight,
    });
    const expandedShellHeight = currentShellHeight + Math.max(
      0,
      CHATBOX_COMPOSER_MAX_HEIGHT - currentHeight,
    );
    const expandedFrameHeight = resolveNativeFrameHeightForShellHeight(expandedShellHeight);
    const currentReservedFrameHeight = reservedChatboxFrameHeightRef.current;
    setComposerSizeStateValue(resolveComposerSizeStateForMetrics(composerMetrics, false));
    setReservedNativeFrameHeight(expandedFrameHeight);

    if (
      Number.isFinite(currentReservedFrameHeight)
      && currentReservedFrameHeight >= expandedFrameHeight
    ) {
      applyComposerHeight(nextHeight);
      return;
    }

    IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, {
      height: currentAnchorHeight,
      frameHeight: expandedFrameHeight,
    }).catch((error) => {
      console.warn('[MinimalChatPill] Failed to presize chat window:', error);
    }).finally(() => {
      if (composerResizeSequenceRef.current !== sequence) {
        return;
      }
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        applyComposerHeight(nextHeight);
        return;
      }
      window.requestAnimationFrame(() => {
        if (composerResizeSequenceRef.current === sequence) {
          applyComposerHeight(nextHeight);
        }
      });
    });
  }, [
    applyComposerHeight,
    clearComposerCollapseFrame,
    clearNativeFrameCollapse,
    createComposerCollapseSnapshot,
    hasAttachmentPreview,
    inputValue,
    resolveNativeFrameHeightForShellHeight,
    resolveComposerSizeStateForMetrics,
    runClampedComposerCollapse,
    scheduleNativeFrameCollapse,
    setComposerCollapseSnapshotValue,
    setComposerSizeStateValue,
    setReservedNativeFrameHeight,
  ]);

  useTextareaAutoResize(inputValue, resizeComposer);

  const syncCloseButtonAnchor = useCallback(() => {
    const pillElement = pillRef.current;
    const sendButtonElement = sendButtonRef.current;
    if (!pillElement || !sendButtonElement) {
      return;
    }

    const pillRect = pillElement.getBoundingClientRect();
    const sendRect = sendButtonElement.getBoundingClientRect();
    if (pillRect.width <= 0 || sendRect.width <= 0) {
      return;
    }

    const pillWidth = Math.max(
      Math.round(Number(pillElement.offsetWidth) || 0),
      Math.round(Number(pillRect.width) || 0),
    );
    if (pillWidth <= 0) {
      return;
    }

    const centerX = Math.round((sendRect.left - pillRect.left) + (sendRect.width / 2));
    if (closeButtonAnchorSnapshotRef.current.centerX !== centerX) {
      pillElement.style.setProperty('--chatbox-close-center-x', `${centerX}px`);
      closeButtonAnchorSnapshotRef.current.centerX = centerX;
    }
  }, []);

  const scheduleCloseButtonAnchorSync = useCallback(() => {
    if (closeButtonAnchorFrameRef.current !== null) {
      window.cancelAnimationFrame(closeButtonAnchorFrameRef.current);
    }
    closeButtonAnchorFrameRef.current = window.requestAnimationFrame(() => {
      closeButtonAnchorFrameRef.current = null;
      syncCloseButtonAnchor();
    });
  }, [syncCloseButtonAnchor]);

  useLayoutEffect(() => {
    scheduleCloseButtonAnchorSync();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleCloseButtonAnchorSync);
    }

    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        scheduleCloseButtonAnchorSync();
      });
      if (pillRef.current) {
        resizeObserver.observe(pillRef.current);
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleCloseButtonAnchorSync);
      }
      if (closeButtonAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(closeButtonAnchorFrameRef.current);
        closeButtonAnchorFrameRef.current = null;
      }
      resizeObserver?.disconnect();
    };
  }, [scheduleCloseButtonAnchorSync, devUiEnabled]);

  const setChatboxHitTestActive = useCallback((active) => {
    const nextActive = active === true;
    if (chatboxHitTestActiveRef.current === nextActive) {
      return;
    }
    chatboxHitTestActiveRef.current = nextActive;
    IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_HIT_TEST_ACTIVE, {
      active: nextActive,
    }).catch(() => {});
    logRendererLiveSurfaceTrace('chat_pill.hit_test.set', {
      source: 'minimal-chat-pill-renderer',
      reason: 'renderer-normal-hit-test-request',
      active: nextActive,
      ignoreMouseEvents: !nextActive,
    }, sessionInfo?.conversationRef || null);
  }, [sessionInfo?.conversationRef]);

  useEffect(() => {
    setChatboxHitTestActive(true);
    return () => {
      setChatboxHitTestActive(true);
    };
  }, [setChatboxHitTestActive]);

  useVoiceMode(
    wakewordSttEnabled && wakewordSttSessionActive,
    (text, isFinal) => {
      updateTranscription(text);
      if (isFinal) {
        setWakewordSttSessionActive(false);
      }
    },
    () => {
      setWakewordSttSessionActive(false);
    },
  );

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    void submitMessageValue(inputValue);
  }, [inputValue, submitMessageValue]);

  const handleOpenConfig = useCallback(async () => {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, {
        maximize: true,
        open: 'chat',
        reason: 'chat-pill-settings',
      });
    } catch (error) {
      console.warn('[MinimalChatPill] Failed to show main window:', error);
    }
  }, []);

  const handleHideChatbox = useCallback(async () => {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX, { reason: 'user' });
    } catch (error) {
      console.warn('[MinimalChatPill] Failed to hide chat window:', error);
    }
  }, []);

  const handleComposerKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessageValue(inputValue);
    }
  }, [inputValue, submitMessageValue]);

  const handleToggleQueryScreenshot = useCallback(() => {
    if (chatSurface.toggleQueryScreenshot()) {
      focusInput();
    }
  }, [chatSurface, focusInput]);

  const handleToggleSpeechMode = useCallback(() => {
    chatSurface.toggleSpeechMode();
  }, [chatSurface]);

  const handleStopQuery = useCallback(() => {
    if (!loopInteractionLocked) {
      return;
    }
    applyStopQueryUiState({
      setIsSending,
      setThinkingStatus,
      setThinkingSourceEventType,
      updateStreamTracking,
    });
    void Promise.resolve(DesktopLiveTurnRuntimeClient.stop(sessionInfo?.conversationRef || null)).catch((error) => {
      console.warn('[MinimalChatPill] Failed to stop query:', error);
    });
  }, [
    loopInteractionLocked,
    sessionInfo?.conversationRef,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateStreamTracking,
  ]);

  const handleDevAutoCompaction = useCallback(() => {
    void chatSurface.runManualCompaction();
  }, [chatSurface]);

  const handleDragMove = useCallback((event) => {
    const nextTarget = getChatboxDragTarget(dragStateRef.current, event);
    if (!nextTarget) {
      return;
    }

    IpcBridge.send(SEND_CHANNELS.MOVE_CHATBOX_TO, nextTarget);
    event.preventDefault();
  }, []);

  const stopDragging = useCallback(() => {
    stopChatboxDrag(dragStateRef.current);
  }, []);

  useChatboxDragWindowBindings(handleDragMove, stopDragging);

  const handlePillMouseDown = useCallback((event) => {
    if (event.button !== 0) {
      return;
    }
    startChatboxDrag(
      dragStateRef.current,
      event,
      window.screenX,
      window.screenY,
    );
  }, []);

  const handlePillClickCapture = useCallback((event) => {
    if (!dragStateRef.current.didDrag) {
      return;
    }
    dragStateRef.current.didDrag = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);
  useChatboxVisualAnchorBindings({
    shellRef,
    hasImagePreview: hasAttachmentPreview,
    frameHeight: reservedChatboxFrameHeight,
    anchorHeightOverride: (
      composerSizeState === COMPOSER_SIZE_STATE.COLLAPSE_FREEZE
      || composerSizeState === COMPOSER_SIZE_STATE.COLLAPSE_RELEASE
    )
      ? composerCollapseSnapshot?.anchorHeight || null
      : null,
  });

  return (
    <div
      className={`chatbox-shell-wrap chatbox-input-shell-wrap${hasAttachmentPreview ? ' with-preview' : ''}${loopInteractionLocked ? ' loop-active' : ''}${composerSizeState === COMPOSER_SIZE_STATE.COLLAPSE_FREEZE ? ' composer-collapse-freeze' : ''}${composerSizeState === COMPOSER_SIZE_STATE.COLLAPSE_RELEASE ? ' composer-collapse-release' : ''}`}
      style={{
        '--chatbox-bump-height': `${closeBumpHeight}px`,
        '--chatbox-composer-freeze-pill-height': composerCollapseSnapshot
          ? `${composerCollapseSnapshot.pillHeight}px`
          : undefined,
        '--chatbox-composer-freeze-shell-height': composerCollapseSnapshot
          ? `${composerCollapseSnapshot.shellHeight}px`
          : undefined,
      }}
    >
      <div className="chatbox-shell" ref={shellRef}>
        <form
          ref={pillRef}
          className={`chatbox-pill${hasAttachmentPreview ? ' with-preview' : ''}`}
          onSubmit={handleSubmit}
          onMouseDown={handlePillMouseDown}
          onClickCapture={handlePillClickCapture}
        >
          <button
            type="button"
            className="chatbox-close-badge"
            onClick={handleHideChatbox}
            aria-label="Hide chat pill"
            title="Hide chat pill"
          >
            <CloseIcon />
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            data-testid="chatbox-attachment-input"
            style={{ display: 'none' }}
            onChange={(event) => {
              void handleAttachmentSelection(event).catch((error) => {
                console.warn('[MinimalChatPill] Failed to parse selected attachments:', error);
              });
            }}
          />
          <AttachmentPreviewRow
            clipboardImages={clipboardImages}
            readableFiles={selectedReadableFiles}
            onRemoveImage={(id) => {
              setClipboardImages((previous) => (
                previous.filter((image) => image.id !== id)
              ));
            }}
            onRemoveFile={(id) => {
              setSelectedReadableFiles((previous) => (
                previous.filter((file) => file.id !== id)
              ));
            }}
          />
          <div className="chatbox-main-row">
            <button
              type="button"
              className="chatbox-icon chatbox-config"
              onClick={handleOpenConfig}
              aria-label="Open config"
              title="Open config"
            >
              <SettingsIcon />
            </button>
            {devUiEnabled ? (
              <button
                type="button"
                className="chatbox-icon chatbox-dev-compact"
                onClick={handleDevAutoCompaction}
                aria-label="Run auto compaction"
                title="Run auto compaction"
                disabled={loopInteractionLocked}
              >
                <CompactIcon />
              </button>
            ) : null}
            <button
              type="button"
              className="chatbox-icon chatbox-attach"
              onClick={() => {
                attachmentInputRef.current?.click();
              }}
              aria-label="Add attachment"
              title="Add attachment"
            >
              <AttachmentIcon />
            </button>
            <div className="chatbox-input-wrap">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onPaste={(event) => {
                  void handleComposerPaste(event).catch((error) => {
                    console.warn('[MinimalChatPill] Failed to parse pasted image:', error);
                  });
                }}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask me to do anything..."
                className="chatbox-input composer-textarea"
                rows={1}
              />
            </div>
            <button
              type="button"
              className={`chatbox-icon chatbox-screenshot${includeQueryScreenshot ? ' is-enabled' : ''}`}
              aria-label="Toggle auto screenshot"
              title={includeQueryScreenshot ? 'Disable auto screenshot' : 'Enable auto screenshot'}
              onClick={handleToggleQueryScreenshot}
            >
              <ScreenshotIcon />
            </button>
            <button
              type="button"
              className={`chatbox-icon chatbox-tts${speechModeEnabled ? ' is-enabled' : ''}`}
              aria-label="Toggle text-to-speech"
              title={speechModeEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
              onClick={handleToggleSpeechMode}
            >
              <SoundIcon />
            </button>
            <button
              ref={sendButtonRef}
              type={loopInteractionLocked ? 'button' : 'submit'}
              className={`chatbox-icon ${loopInteractionLocked ? 'chatbox-stop' : 'chatbox-send'}`}
              aria-label={loopInteractionLocked ? 'Stop response' : 'Send message'}
              title={loopInteractionLocked ? 'Stop response' : 'Send message'}
              disabled={!loopInteractionLocked && !inputValue.trim() && !hasAttachments}
              onClick={loopInteractionLocked ? handleStopQuery : undefined}
            >
              {loopInteractionLocked ? <StopIcon /> : <SendIcon />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MinimalChatPill;
