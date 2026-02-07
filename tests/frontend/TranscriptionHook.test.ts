import { act, renderHook } from '@testing-library/react';

import { useTranscription } from '../../frontend/src/renderer/features/chat/hooks/useTranscription';

describe('useTranscription', () => {
  test('replaces prior transcription chunk instead of appending', () => {
    const { result } = renderHook(() => useTranscription(''));

    act(() => {
      result.current.updateTranscription('hello');
    });
    expect(result.current.inputValue).toBe('hello');

    act(() => {
      result.current.updateTranscription('world');
    });
    expect(result.current.inputValue).toBe('world');
  });

  test('invalidates transcription region when user edits inside it', () => {
    const { result } = renderHook(() => useTranscription(''));

    act(() => {
      result.current.updateTranscription('hello');
    });
    expect(result.current.inputValue).toBe('hello');

    act(() => {
      result.current.handleInputChange({
        target: {
          value: 'heXllo',
          selectionStart: 3,
        },
      } as any);
    });
    expect(result.current.inputValue).toBe('heXllo');

    act(() => {
      result.current.updateTranscription('world');
    });
    expect(result.current.inputValue).toBe('heXlloworld');
  });

  test('handles paste input and prevents default browser behavior', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useTranscription('base'));

    const setSelectionRange = jest.fn();
    const preventDefault = jest.fn();
    const input = {
      selectionStart: 2,
      selectionEnd: 2,
      setSelectionRange,
    };

    act(() => {
      result.current.handlePaste({
        clipboardData: { getData: () => 'XYZ' },
        target: input,
        preventDefault,
      } as any);
    });

    expect(result.current.inputValue).toBe('baXYZse');
    expect(preventDefault).toHaveBeenCalled();

    act(() => {
      jest.runAllTimers();
    });
    expect(setSelectionRange).toHaveBeenCalledWith(5, 5);

    jest.useRealTimers();
  });
});

