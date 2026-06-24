/**
 * Provides the minimal chat pill module for the renderer UI.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { selectLiveTurnSurfaceState, useChatStore } from '../../chat/stores/chatStore';
import { useChatMessageSender } from '../../chat/hooks/useChatMessageSender';
import { useChatComposerDraft } from '../../chat/hooks/useChatComposerDraft';
import { useRendererConversationSessionInfo } from '../../chat/session/useRendererConversationSessionInfo';
import { DesktopWindowRuntimeClient } from '../../../app/runtime/desktopWindowRuntimeClient';
import {
  useChatboxDragWindowBindings,
  useChatboxFocusBindings,
  useChatboxVisualAnchorBindings,
  useChatboxWakewordSttTriggerBinding,
} from '../hooks/useMinimalChatPillBindings';
import { useTextareaAutoResize } from '../../chat/hooks/useMessageInputUiBindings';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import { DesktopDevUiRuntime } from '../../../app/runtime/desktopDevUiRuntime';
import { DesktopChatboxLayoutRuntime } from '../../../app/runtime/desktopChatboxLayoutRuntime';
import { DesktopChatboxInteractionRuntime } from '../../../app/runtime/desktopChatboxInteractionRuntime';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';
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
import { useStopTurnHandler } from '../../chat/hooks/useStopTurnHandler';

const CHATBOX_COMPOSER_COMPACT_HEIGHT = 34;
const CHATBOX_COMPOSER_MAX_HEIGHT = 128;
const CHATBOX_NATIVE_FRAME_COLLAPSE_DELAY_MS = 180;
const { isDevUiEnabled } = DesktopDevUiRuntime;
const {
  logRendererChatPillHitTestTrace,
  logRendererChatPillLifecycleTrace,
  logRendererChatPillResetTrace,
  logRendererChatPillStateTrace,
} = DesktopRendererTraceRuntime;

function MinimalChatPill() {
  const closeBumpHeight = DesktopChatboxLayoutRuntime.getChatboxCloseBumpHeight();
  const {
    messages,
    currentTurnProjection,
    conversationView,
    pendingTurn,
  } = useChatStore(useShallow(selectLiveTurnSurfaceState));
  const sessionInfo = useRendererConversationSessionInfo();
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const [wakewordSttSessionActive, setWakewordSttSessionActive] = useState(false);
  const [reservedChatboxFrameHeight, setReservedChatboxFrameHeight] = useState(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const inputRef = useRef(null);
  const pillRef = useRef(null);
  const shellRef = useRef(null);
  const sendButtonRef = useRef(null);
  const closeButtonAnchorSnapshotRef = useRef({ centerX: null });
  const composerResizeSequenceRef = useRef(0);
  const reservedChatboxFrameHeightRef = useRef(null);
  const nativeFrameCollapseTimeoutRef = useRef(null);
  const lastLoggedPillStateRef = useRef('');
  const lifecycleTraceSnapshotRef = useRef({
    conversationRef: null,
    turnRef: null,
    phase: null,
  });
  const dragStateRef = useRef(DesktopChatboxLayoutRuntime.createChatboxDragState());
  const chatboxHitTestActiveRef = useRef(null);
  const textEntryActiveRef = useRef(false);
  const chatSurface = useChatSurfaceController({
    messages,
    currentTurnProjection,
    conversationView,
    pendingTurn,
    sessionInfo,
    setThinkingStatus,
    setThinkingSourceEventType,
    warningContext: 'MinimalChatPill',
  });
  const {
    includeQueryScreenshot,
    canStop: stopAvailable,
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
      const conversationRef = sessionInfo?.conversationRef || null;
      logRendererChatPillResetTrace({
        conversationRef,
        previousTurnRef: currentTurnProjection?.turnRef || null,
        previousPhase: currentTurnProjection?.phase || null,
        attachmentCount: clipboardImages.length + selectedReadableFiles.length,
        includeQueryScreenshot,
      });
      setWakewordSttSessionActive(false);
    },
  });
  const hasAttachmentPreview = hasAttachments;

  useEffect(() => {
    reservedChatboxFrameHeightRef.current = reservedChatboxFrameHeight;
  }, [reservedChatboxFrameHeight]);

  const clearNativeFrameCollapse = useCallback(() => {
    DesktopChatboxInteractionRuntime.clearChatboxNativeFrameCollapse({
      timeoutRef: nativeFrameCollapseTimeoutRef,
    });
  }, []);

  const resolveNativeFrameHeightForShellHeight = useCallback((shellHeight) => {
    return DesktopChatboxLayoutRuntime.resolveChatboxNativeFrameHeight({
      hasImagePreview: hasAttachmentPreview,
      shellHeight,
    });
  }, [hasAttachmentPreview]);

  const setReservedNativeFrameHeight = useCallback((nextFrameHeight) => {
    const normalizedFrameHeight = Math.max(1, Math.round(Number(nextFrameHeight) || 0));
    if (reservedChatboxFrameHeightRef.current === normalizedFrameHeight) {
      return;
    }
    reservedChatboxFrameHeightRef.current = normalizedFrameHeight;
    setReservedChatboxFrameHeight(normalizedFrameHeight);
  }, []);

  const scheduleNativeFrameCollapse = useCallback(() => {
    DesktopChatboxInteractionRuntime.scheduleChatboxNativeFrameCollapse({
      timeoutRef: nativeFrameCollapseTimeoutRef,
      delayMs: CHATBOX_NATIVE_FRAME_COLLAPSE_DELAY_MS,
      callback: () => {
        if ((inputRef.current?.value || '').trim() || hasAttachmentPreview) {
          return;
        }
        const shellHeight = shellRef.current?.offsetHeight ?? null;
        const nextAnchorHeight = DesktopChatboxLayoutRuntime.resolveChatboxVisualAnchorHeight({
          hasImagePreview: hasAttachmentPreview,
          shellHeight,
        });
        reservedChatboxFrameHeightRef.current = null;
        setReservedChatboxFrameHeight(null);
        DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(nextAnchorHeight).catch((error) => {
          console.warn('[MinimalChatPill] Failed to collapse chat window frame:', error);
        });
      },
    });
  }, [hasAttachmentPreview]);

  useEffect(() => {
    return () => {
      clearNativeFrameCollapse();
    };
  }, [clearNativeFrameCollapse]);

  const focusInput = useCallback(() => {
    textEntryActiveRef.current = true;
    DesktopChatboxInteractionRuntime.focusChatboxTextInputAtEnd(inputRef);
  }, []);

  const activateTextEntry = useCallback(() => {
    DesktopWindowRuntimeClient.activateChatboxTextEntryForReason('text-entry').catch((error) => {
      console.warn('[MinimalChatPill] Failed to activate text entry:', error);
    });
  }, []);

  const requestTextEntryActivation = useCallback((event) => {
    if (textEntryActiveRef.current !== true) {
      event.preventDefault();
    }
    activateTextEntry();
  }, [activateTextEntry]);

  useChatboxFocusBindings(focusInput);
  useChatboxWakewordSttTriggerBinding({
    wakewordSttEnabled,
    resetTranscription,
    setInputValue,
    setWakewordSttSessionActive,
  });

  useEffect(() => {
    if (!wakewordSttEnabled && wakewordSttSessionActive) {
      setWakewordSttSessionActive(false);
    }
  }, [wakewordSttEnabled, wakewordSttSessionActive]);

  useEffect(() => {
    const initialSnapshot = lifecycleTraceSnapshotRef.current;
    logRendererChatPillLifecycleTrace({
      action: 'mount',
      conversationRef: initialSnapshot.conversationRef,
      turnRef: initialSnapshot.turnRef,
      phase: initialSnapshot.phase,
    });
    return () => {
      const latestSnapshot = lifecycleTraceSnapshotRef.current;
      logRendererChatPillLifecycleTrace({
        action: 'unmount',
        conversationRef: latestSnapshot.conversationRef,
        turnRef: latestSnapshot.turnRef,
        phase: latestSnapshot.phase,
      });
    };
  }, []);

  useEffect(() => {
    const nextPillStateSignature = JSON.stringify({
      loopInteractionLocked,
      liveTurnPhase,
      liveTurnSource,
      currentTurnPhase: currentTurnProjection?.phase || null,
      currentTurnRef: currentTurnProjection?.turnRef || null,
      viewTurnRef: conversationView?.liveTurn?.turnRef || null,
      viewPillMode: conversationView?.surfaces?.pill?.mode || null,
      viewCanStop: conversationView?.liveTurn?.canStop === true,
    });
    if (lastLoggedPillStateRef.current === nextPillStateSignature) {
      return;
    }
    lastLoggedPillStateRef.current = nextPillStateSignature;
    logRendererChatPillStateTrace({
      conversationRef: sessionInfo?.conversationRef || null,
      turnRef: currentTurnProjection?.turnRef || null,
      currentTurnPhase: currentTurnProjection?.phase || null,
      liveTurnPhase,
      liveTurnSource,
      busy: loopInteractionLocked,
      stopAvailable,
      messageCount: messages.length,
    });
  }, [
    conversationView?.liveTurn?.canStop,
    conversationView?.liveTurn?.turnRef,
    conversationView?.surfaces?.pill?.mode,
    currentTurnProjection?.phase,
    currentTurnProjection?.turnRef,
    liveTurnPhase,
    liveTurnSource,
    loopInteractionLocked,
    messages.length,
    sessionInfo?.conversationRef,
    stopAvailable,
  ]);

  const applyComposerHeight = useCallback((height) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.style.height = `${height}px`;
  }, []);

  const resizeComposer = useCallback(() => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    const currentHeight = Math.max(
      1,
      Math.round(inputElement.getBoundingClientRect?.().height || inputElement.offsetHeight || 0),
    );
    const previousHeightStyle = inputElement.style.height;
    inputElement.style.height = 'auto';
    const nextHeight = Math.min(inputElement.scrollHeight, CHATBOX_COMPOSER_MAX_HEIGHT);
    inputElement.style.height = previousHeightStyle;
    setComposerExpanded(
      inputValue.includes('\n') || nextHeight > CHATBOX_COMPOSER_COMPACT_HEIGHT,
    );
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }

    const sequence = composerResizeSequenceRef.current + 1;
    composerResizeSequenceRef.current = sequence;

    if (nextHeight <= currentHeight) {
      applyComposerHeight(nextHeight);
      if (!inputValue.trim() && !hasAttachmentPreview) {
        scheduleNativeFrameCollapse();
      }
      return;
    }

    clearNativeFrameCollapse();
    const shellElement = shellRef.current;
    const currentShellHeight = Math.max(
      1,
      Math.round(shellElement?.offsetHeight || 0),
    );
    const currentAnchorHeight = DesktopChatboxLayoutRuntime.resolveChatboxVisualAnchorHeight({
      hasImagePreview: hasAttachmentPreview,
      shellHeight: currentShellHeight,
    });
    const expandedShellHeight = currentShellHeight + Math.max(
      0,
      CHATBOX_COMPOSER_MAX_HEIGHT - currentHeight,
    );
    const expandedFrameHeight = resolveNativeFrameHeightForShellHeight(expandedShellHeight);
    const currentReservedFrameHeight = reservedChatboxFrameHeightRef.current;
    setReservedNativeFrameHeight(expandedFrameHeight);

    if (
      Number.isFinite(currentReservedFrameHeight)
      && currentReservedFrameHeight >= expandedFrameHeight
    ) {
      applyComposerHeight(nextHeight);
      return;
    }

    DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(
      currentAnchorHeight,
      expandedFrameHeight,
    ).catch((error) => {
      console.warn('[MinimalChatPill] Failed to presize chat window:', error);
    }).finally(() => {
      DesktopChatboxInteractionRuntime.scheduleChatboxComposerHeightCommit({
        sequenceRef: composerResizeSequenceRef,
        sequence,
        height: nextHeight,
        applyComposerHeight,
      });
    });
  }, [
    applyComposerHeight,
    clearNativeFrameCollapse,
    hasAttachmentPreview,
    inputValue,
    resolveNativeFrameHeightForShellHeight,
    scheduleNativeFrameCollapse,
    setReservedNativeFrameHeight,
  ]);

  useTextareaAutoResize(inputValue, resizeComposer);

  useLayoutEffect(() => {
    return DesktopChatboxInteractionRuntime.startChatboxCloseButtonAnchorSync({
      pillRef,
      sendButtonRef,
      snapshotRef: closeButtonAnchorSnapshotRef,
    });
  }, [devUiEnabled]);

  const setChatboxHitTestActive = useCallback((active) => {
    const nextActive = active === true;
    if (chatboxHitTestActiveRef.current === nextActive) {
      return;
    }
    chatboxHitTestActiveRef.current = nextActive;
    DesktopWindowRuntimeClient.setChatboxHitTestActiveValue(nextActive).catch(() => {});
    logRendererChatPillHitTestTrace({
      conversationRef: sessionInfo?.conversationRef || null,
      active: nextActive,
    });
  }, [sessionInfo?.conversationRef]);

  useEffect(() => {
    setChatboxHitTestActive(false);
    return () => {
      setChatboxHitTestActive(false);
    };
  }, [setChatboxHitTestActive]);

  const clearTextEntryActive = useCallback(() => {
    textEntryActiveRef.current = false;
  }, []);

  useEffect(() => {
    return DesktopChatboxInteractionRuntime.subscribeToChatboxHitTestEvents({
      pillRef,
      onHitTestActiveChange: setChatboxHitTestActive,
      onTextEntryBlur: clearTextEntryActive,
    });
  }, [clearTextEntryActive, setChatboxHitTestActive]);

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
      await DesktopWindowRuntimeClient.showMainWindowWithValues(
        null,
        true,
        'chat',
        'chat-pill-settings',
      );
    } catch (error) {
      console.warn('[MinimalChatPill] Failed to show main window:', error);
    }
  }, []);

  const handleHideChatbox = useCallback(async () => {
    try {
      await DesktopWindowRuntimeClient.hideChatboxForReason('user');
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
      activateTextEntry();
    }
  }, [activateTextEntry, chatSurface]);

  const handleToggleSpeechMode = useCallback(() => {
    chatSurface.toggleSpeechMode();
  }, [chatSurface]);
  const { handleStopTurn } = useStopTurnHandler({
    enabled: stopAvailable,
    conversationView,
    currentTurnProjection,
    pendingTurn,
    sessionConversationRef: sessionInfo?.conversationRef || null,
    warningContext: 'MinimalChatPill',
  });

  const handleDevAutoCompaction = useCallback(() => {
    void chatSurface.runManualCompaction();
  }, [chatSurface]);

  const handleDragMove = useCallback((event) => {
    const nextTarget = DesktopChatboxLayoutRuntime.getChatboxDragTarget(dragStateRef.current, event);
    if (!nextTarget) {
      return;
    }

    DesktopWindowRuntimeClient.moveChatboxTo(nextTarget);
    event.preventDefault();
  }, []);

  const stopDragging = useCallback(() => {
    DesktopChatboxLayoutRuntime.stopChatboxDrag(dragStateRef.current);
  }, []);

  useChatboxDragWindowBindings(handleDragMove, stopDragging);

  const beginPillDragTracking = useCallback((event) => {
    if (event.button !== 0) {
      return;
    }
    DesktopChatboxLayoutRuntime.startChatboxDragFromWindow(
      dragStateRef.current,
      event,
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
  });

  return (
    <div
      className={`chatbox-shell-wrap chatbox-input-shell-wrap${hasAttachmentPreview ? ' with-preview' : ''}${composerExpanded ? ' is-composer-expanded' : ''}${loopInteractionLocked ? ' loop-active' : ''}`}
      style={{ '--chatbox-bump-height': `${closeBumpHeight}px` }}
    >
      <div className="chatbox-shell" ref={shellRef}>
        <form
          ref={pillRef}
          className={`chatbox-pill${hasAttachmentPreview ? ' with-preview' : ''}${composerExpanded ? ' is-composer-expanded' : ''}`}
          onSubmit={handleSubmit}
          onPointerDownCapture={beginPillDragTracking}
          onMouseDown={beginPillDragTracking}
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
            <div className="chatbox-controls-group">
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
            </div>
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
                onPointerDown={requestTextEntryActivation}
                onBlur={clearTextEntryActive}
                placeholder="Ask me to do anything..."
                className="chatbox-input composer-textarea"
                rows={1}
              />
            </div>
            <div className="chatbox-controls-group chatbox-controls-group-end">
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
                disabled={loopInteractionLocked ? !stopAvailable : (!inputValue.trim() && !hasAttachments)}
                onClick={loopInteractionLocked && stopAvailable ? handleStopTurn : undefined}
              >
                {loopInteractionLocked ? <StopIcon /> : <SendIcon />}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MinimalChatPill;
