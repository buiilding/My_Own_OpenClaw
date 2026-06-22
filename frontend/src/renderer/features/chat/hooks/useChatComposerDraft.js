/**
 * Provides the use chat composer draft module for the renderer UI.
 */

import { useCallback, useRef, useState } from 'react';
import { useTranscription } from './useTranscription';
import { DesktopMessageInputRuntime } from '../../../app/runtime/desktopMessageInputRuntime';
import {
  DesktopComposerAttachmentRuntime,
} from '../../../app/runtime/desktopComposerAttachmentRuntime';

const {
  buildOutgoingMessage,
} = DesktopMessageInputRuntime;
const {
  parseClipboardImagePasteEvent,
  parseSelectedComposerFiles,
} = DesktopComposerAttachmentRuntime;

export function useChatComposerDraft({
  isSubmitBlocked = false,
  onSendMessage,
  onBeforeSend,
}) {
  const attachmentInputRef = useRef(null);
  const [clipboardImages, setClipboardImages] = useState([]);
  const [selectedReadableFiles, setSelectedReadableFiles] = useState([]);
  const {
    inputValue,
    setInputValue,
    getInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handlePaste,
  } = useTranscription();

  const clearDraft = useCallback(() => {
    setInputValue('');
    resetTranscription();
    setClipboardImages([]);
    setSelectedReadableFiles([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  }, [resetTranscription, setInputValue]);

  const restoreDraft = useCallback((snapshot) => {
    setInputValue(snapshot.inputValue);
    resetTranscription();
    setClipboardImages(snapshot.clipboardImages);
    setSelectedReadableFiles(snapshot.selectedReadableFiles);
  }, [resetTranscription, setInputValue]);

  const submitMessageValue = useCallback(async (nextInputValue) => {
    const outgoingMessage = buildOutgoingMessage(
      nextInputValue,
      isSubmitBlocked,
      clipboardImages,
      selectedReadableFiles,
    );
    if (!outgoingMessage) {
      return false;
    }

    const draftSnapshot = {
      inputValue: nextInputValue,
      clipboardImages: [...clipboardImages],
      selectedReadableFiles: [...selectedReadableFiles],
    };

    onBeforeSend?.();
    clearDraft();
    try {
      const sendResult = onSendMessage(outgoingMessage);
      if (sendResult && typeof sendResult.then === 'function') {
        await sendResult;
      }
    } catch (error) {
      restoreDraft(draftSnapshot);
      throw error;
    }
    return true;
  }, [
    clearDraft,
    clipboardImages,
    isSubmitBlocked,
    onBeforeSend,
    onSendMessage,
    restoreDraft,
    selectedReadableFiles,
  ]);

  const handleComposerPaste = useCallback(async (event) => {
    const pasteResult = await parseClipboardImagePasteEvent(event);
    if (!pasteResult.hasImageItems) {
      handlePaste(event);
      return;
    }

    if (pasteResult.images.length > 0) {
      event.preventDefault();
      setClipboardImages((previous) => [...previous, ...pasteResult.images]);
    }
  }, [handlePaste]);

  const handleAttachmentSelection = useCallback(async (event) => {
    const fileList = event?.target?.files || [];
    if (!fileList || fileList.length === 0) {
      return;
    }

    try {
      const parsedAttachments = await parseSelectedComposerFiles(fileList);
      if (parsedAttachments.imageAttachments.length > 0) {
        setClipboardImages((previous) => [...previous, ...parsedAttachments.imageAttachments]);
      }
      if (parsedAttachments.readableFiles.length > 0) {
        setSelectedReadableFiles((previous) => [...previous, ...parsedAttachments.readableFiles]);
      }
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
    }
  }, []);

  return {
    attachmentInputRef,
    clipboardImages,
    selectedReadableFiles,
    inputValue,
    setInputValue,
    getInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handleComposerPaste,
    handleAttachmentSelection,
    submitMessageValue,
    setClipboardImages,
    setSelectedReadableFiles,
    hasAttachments: clipboardImages.length > 0 || selectedReadableFiles.length > 0,
  };
}
