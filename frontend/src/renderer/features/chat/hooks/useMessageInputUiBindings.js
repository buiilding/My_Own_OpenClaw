/**
 * Provides the use message input ui bindings module for the renderer UI.
 */

import { useEffect, useLayoutEffect } from 'react';

export function useTextareaAutoResize(inputValue, resizeTextarea) {
  useLayoutEffect(() => {
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

export function useClosePlusMenuOnLoopActive(isLoopActive, setPlusMenuOpen) {
  useEffect(() => {
    if (!isLoopActive) {
      return;
    }
    setPlusMenuOpen(false);
  }, [isLoopActive, setPlusMenuOpen]);
}

export function useComposerFocusRequest({
  focusRequestToken,
  handleFocusRequest,
}) {
  useEffect(() => {
    handleFocusRequest(focusRequestToken);
  }, [focusRequestToken, handleFocusRequest]);
}
