/**
 * Covers transcription hook. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { useTranscription } from '../../src/renderer/features/chat/hooks/useTranscription';

describe('useTranscription', () => {
  const updateTranscription = (
    result: ReturnType<typeof renderHook<typeof useTranscription>>['result'],
    text: string,
  ) => {
    act(() => {
      result.current.updateTranscription(text);
    });
  };

  const changeInput = (
    result: ReturnType<typeof renderHook<typeof useTranscription>>['result'],
    value: string,
    selectionStart: number | null,
  ) => {
    act(() => {
      result.current.handleInputChange({
        target: { value, selectionStart },
      } as any);
    });
  };

  test('replaces prior transcription chunk instead of appending', () => {
    const { result } = renderHook(() => useTranscription(''));

    updateTranscription(result, 'hello');
    expect(result.current.inputValue).toBe('hello');

    updateTranscription(result, 'world');
    expect(result.current.inputValue).toBe('world');
  });

  test('invalidates transcription region when user edits inside it', () => {
    const { result } = renderHook(() => useTranscription(''));

    updateTranscription(result, 'hello');
    expect(result.current.inputValue).toBe('hello');

    changeInput(result, 'heXllo', 3);
    expect(result.current.inputValue).toBe('heXllo');

    updateTranscription(result, 'world');
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

  test('invalidates transcription region when input change cursor is null', () => {
    const { result } = renderHook(() => useTranscription(''));

    updateTranscription(result, 'hello');
    expect(result.current.inputValue).toBe('hello');

    changeInput(result, 'hello!', null);

    updateTranscription(result, 'world');
    expect(result.current.inputValue).toBe('hello!world');
  });

  test('invalidates transcription region when paste cursor is null', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useTranscription(''));

    updateTranscription(result, 'abc');
    expect(result.current.inputValue).toBe('abc');

    act(() => {
      result.current.handlePaste({
        clipboardData: { getData: () => 'X' },
        target: {
          selectionStart: null,
          selectionEnd: null,
          setSelectionRange: jest.fn(),
        },
        preventDefault: jest.fn(),
      } as any);
    });
    expect(result.current.inputValue).toBe('Xabc');

    updateTranscription(result, 'Y');
    expect(result.current.inputValue).toBe('XabcY');

    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });
});
