import { act, renderHook } from '@testing-library/react';

import { useChatComposerDraft } from '../../frontend/src/renderer/features/chat/hooks/useChatComposerDraft';

describe('useChatComposerDraft', () => {
  test('clears draft after a successful send', async () => {
    const onSendMessage = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useChatComposerDraft({
      onSendMessage,
    }));

    act(() => {
      result.current.setInputValue('  hello world  ');
      result.current.setClipboardImages([
        { id: 'img-1', base64: 'abc', previewUrl: 'data:image/png;base64,abc' },
      ]);
    });

    await act(async () => {
      await result.current.submitMessageValue(result.current.inputValue);
    });

    expect(onSendMessage).toHaveBeenCalledWith({
      text: 'hello world',
      clipboardImages: [
        { id: 'img-1', base64: 'abc', previewUrl: 'data:image/png;base64,abc' },
      ],
      readableFiles: [],
    });
    expect(result.current.inputValue).toBe('');
    expect(result.current.clipboardImages).toEqual([]);
  });

  test('restores draft text and attachments after a failed send', async () => {
    const onSendMessage = jest.fn().mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useChatComposerDraft({
      onSendMessage,
    }));

    act(() => {
      result.current.setInputValue('  retry me  ');
      result.current.setClipboardImages([
        { id: 'img-1', base64: 'abc', previewUrl: 'data:image/png;base64,abc' },
      ]);
      result.current.setSelectedReadableFiles([
        { id: 'file-1', filePath: '/tmp/notes.txt', filename: 'notes.txt' },
      ]);
    });

    await act(async () => {
      await expect(
        result.current.submitMessageValue(result.current.inputValue),
      ).rejects.toThrow('network down');
    });

    expect(result.current.inputValue).toBe('  retry me  ');
    expect(result.current.clipboardImages).toEqual([
      { id: 'img-1', base64: 'abc', previewUrl: 'data:image/png;base64,abc' },
    ]);
    expect(result.current.selectedReadableFiles).toEqual([
      { id: 'file-1', filePath: '/tmp/notes.txt', filename: 'notes.txt' },
    ]);
  });
});
