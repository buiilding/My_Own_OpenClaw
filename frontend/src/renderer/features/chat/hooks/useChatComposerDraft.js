import { useCallback, useRef, useState } from 'react';
import { useTranscription } from './useTranscription';
import { buildOutgoingMessage } from '../utils/message/messageInput';
import { parseClipboardImageItems } from '../utils/clipboardImageUtils';
import { parseSelectedComposerFiles } from '../utils/fileAttachmentUtils';

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

    onBeforeSend?.();
    clearDraft();
    await onSendMessage(outgoingMessage);
    return true;
  }, [
    clearDraft,
    clipboardImages,
    isSubmitBlocked,
    onBeforeSend,
    onSendMessage,
    selectedReadableFiles,
  ]);

  const handleComposerPaste = useCallback(async (event) => {
    const clipboardItems = event.clipboardData?.items || [];
    const hasImageItems = Array.from(clipboardItems).some((item) => item?.type?.startsWith('image/'));
    if (!hasImageItems) {
      handlePaste(event);
      return;
    }

    const parsedImages = await parseClipboardImageItems(clipboardItems);
    if (parsedImages.length > 0) {
      event.preventDefault();
      setClipboardImages((previous) => [...previous, ...parsedImages]);
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
