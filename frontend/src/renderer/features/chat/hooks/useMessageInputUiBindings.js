import { useEffect } from 'react';

export function useTextareaAutoResize(inputValue, resizeTextarea) {
  useEffect(() => {
    resizeTextarea();
  }, [inputValue, resizeTextarea]);
}

export function useDismissPlusMenu(plusMenuRef, setPlusMenuOpen) {
  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setPlusMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [plusMenuRef, setPlusMenuOpen]);
}

export function useClosePlusMenuOnSending(isSending, setPlusMenuOpen) {
  useEffect(() => {
    if (!isSending) {
      return;
    }
    setPlusMenuOpen(false);
  }, [isSending, setPlusMenuOpen]);
}

export function useComposerFocusRequest({
  focusRequestToken,
  handleFocusRequest,
}) {
  useEffect(() => {
    handleFocusRequest(focusRequestToken);
  }, [focusRequestToken, handleFocusRequest]);
}
