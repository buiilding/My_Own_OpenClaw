import { useState, useRef, useCallback } from 'react';

/**
 * Hook to manage input state and voice transcription updates.
 * Handles the complex logic of inserting transcription text into the input field
 * and managing cursor positions/replacements.
 */
export function useTranscription(initialValue = '') {
  const [inputValue, setInputValue] = useState(initialValue);
  
  // Track transcription region boundaries for chunk replacement
  const transcriptionStartRef = useRef(0);
  const transcriptionEndRef = useRef(0);
  const hasTranscriptionRef = useRef(false);

  const resetTranscription = useCallback(() => {
    transcriptionStartRef.current = 0;
    transcriptionEndRef.current = 0;
    hasTranscriptionRef.current = false;
  }, []);

  const updateTranscription = useCallback((transcriptionText) => {
    if (!transcriptionText) return;

    setInputValue((currentValue) => {
      // If we have an existing transcription region, replace it
      if (hasTranscriptionRef.current) {
        const before = currentValue.substring(0, transcriptionStartRef.current);
        const after = currentValue.substring(transcriptionEndRef.current);
        const newValue = before + transcriptionText + after;
        
        // Update transcription boundaries
        transcriptionStartRef.current = before.length;
        transcriptionEndRef.current = transcriptionStartRef.current + transcriptionText.length;
        
        return newValue;
      } else {
        // No existing transcription, append at end
        const newValue = currentValue + transcriptionText;
        transcriptionStartRef.current = currentValue.length;
        transcriptionEndRef.current = newValue.length;
        hasTranscriptionRef.current = true;
        return newValue;
      }
    });
  }, []);

  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setInputValue((oldValue) => {
      // If user is typing/pasting, update transcription boundaries
      if (hasTranscriptionRef.current) {
        const oldLength = oldValue.length;
        const newLength = newValue.length;
        const diff = newLength - oldLength;
        
        if (cursorPosition <= transcriptionStartRef.current) {
          // User typed before transcription - shift transcription forward
          transcriptionStartRef.current += diff;
          transcriptionEndRef.current += diff;
        } else if (cursorPosition >= transcriptionEndRef.current) {
          // User typed after transcription - keep boundaries
        } else {
          // User typed within transcription - invalidate transcription region
          hasTranscriptionRef.current = false;
          transcriptionStartRef.current = 0;
          transcriptionEndRef.current = 0;
        }
      }
      return newValue;
    });
  }, []);

  const handlePaste = useCallback((e) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    const input = e.target;
    const cursorPosition = input.selectionStart;
    
    setInputValue((currentValue) => {
      const before = currentValue.substring(0, cursorPosition);
      const after = currentValue.substring(input.selectionEnd || cursorPosition);
      const newValue = before + pastedText + after;
      
      if (hasTranscriptionRef.current) {
        if (cursorPosition <= transcriptionStartRef.current) {
          transcriptionStartRef.current += pastedText.length;
          transcriptionEndRef.current += pastedText.length;
        } else if (cursorPosition >= transcriptionEndRef.current) {
          // No change
        } else {
          hasTranscriptionRef.current = false;
          transcriptionStartRef.current = 0;
          transcriptionEndRef.current = 0;
        }
      }
      
      // Set cursor position after pasted text
      setTimeout(() => {
        const newCursorPosition = cursorPosition + pastedText.length;
        input.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);
      
      return newValue;
    });
    
    e.preventDefault();
  }, []);

  return {
    inputValue,
    setInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handlePaste
  };
}
