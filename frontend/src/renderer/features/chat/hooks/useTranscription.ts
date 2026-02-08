import { useState, useRef, useCallback } from 'react';
import {
  appendTranscriptionText,
  buildValueAfterPaste,
  createEmptyTranscriptionRegion,
  replaceTranscriptionText,
  updateRegionAfterInputChange,
  updateRegionAfterPaste,
} from '../utils/transcriptionRegions';

/**
 * Hook to manage input state and voice transcription updates.
 * Handles the complex logic of inserting transcription text into the input field
 * and managing cursor positions/replacements.
 */
export function useTranscription(initialValue: string = '') {
  const [inputValue, setInputValueState] = useState(initialValue);
  const inputValueRef = useRef(initialValue);
  const transcriptionRegionRef = useRef(createEmptyTranscriptionRegion());

  const setInputValue = useCallback((nextValueOrUpdater: string | ((previousValue: string) => string)) => {
    setInputValueState((previousValue) => {
      const nextValue = typeof nextValueOrUpdater === 'function'
        ? nextValueOrUpdater(previousValue)
        : nextValueOrUpdater;
      inputValueRef.current = nextValue;
      return nextValue;
    });
  }, []);

  const clearTranscriptionRegion = useCallback(() => {
    transcriptionRegionRef.current = createEmptyTranscriptionRegion();
  }, []);

  const resetTranscription = useCallback(() => {
    clearTranscriptionRegion();
  }, [clearTranscriptionRegion]);

  const getInputValue = useCallback(() => inputValueRef.current, []);

  const updateTranscription = useCallback((transcriptionText: string) => {
    if (!transcriptionText) return;

    setInputValue((currentValue) => {
      if (transcriptionRegionRef.current.active) {
        const replaced = replaceTranscriptionText(currentValue, transcriptionRegionRef.current, transcriptionText);
        transcriptionRegionRef.current = replaced.region;
        return replaced.value;
      }

      const appended = appendTranscriptionText(currentValue, transcriptionText);
      transcriptionRegionRef.current = appended.region;
      return appended.value;
    });
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setInputValue((oldValue) => {
      transcriptionRegionRef.current = updateRegionAfterInputChange(
        transcriptionRegionRef.current,
        oldValue,
        newValue,
        cursorPosition,
      );
      return newValue;
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    const input = e.target as HTMLInputElement;
    const cursorPosition = input.selectionStart;
    
    setInputValue((currentValue) => {
      const pasted = buildValueAfterPaste(
        currentValue,
        pastedText,
        cursorPosition,
        input.selectionEnd,
      );
      transcriptionRegionRef.current = updateRegionAfterPaste(
        transcriptionRegionRef.current,
        cursorPosition,
        pastedText.length,
      );
      
      // Set cursor position after pasted text
      setTimeout(() => {
        const newCursorPosition = pasted.start + pastedText.length;
        input.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);
      
      return pasted.value;
    });
    
    e.preventDefault();
  }, []);

  return {
    inputValue,
    setInputValue,
    getInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handlePaste
  };
}
