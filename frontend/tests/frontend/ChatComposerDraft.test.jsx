/**
 * Covers chat composer draft. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { useChatComposerDraft } from '../../src/renderer/features/chat/hooks/useChatComposerDraft';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('useChatComposerDraft', () => {
  test('clears text and attachments while send is pending', async () => {
    const sendDeferred = createDeferred();
    const onSendMessage = jest.fn(() => sendDeferred.promise);
    const clipboardImage = {
      base64: 'abc123',
      contentType: 'image/png',
      filename: 'pasted.png',
    };
    const readableFile = {
      filePath: '/tmp/context.txt',
      filename: 'context.txt',
      contentType: 'text/plain',
    };
    const { result } = renderHook(() => useChatComposerDraft({ onSendMessage }));

    act(() => {
      result.current.setInputValue('send this now');
      result.current.setClipboardImages([clipboardImage]);
      result.current.setSelectedReadableFiles([readableFile]);
      result.current.attachmentInputRef.current = { value: 'selected-file' };
    });

    let submitPromise;
    await act(async () => {
      submitPromise = result.current.submitMessageValue(result.current.inputValue);
    });

    expect(onSendMessage).toHaveBeenCalledWith({
      text: 'send this now',
      clipboardImages: [clipboardImage],
      readableFiles: [readableFile],
    });
    expect(result.current.inputValue).toBe('');
    expect(result.current.getInputValue()).toBe('');
    expect(result.current.clipboardImages).toEqual([]);
    expect(result.current.selectedReadableFiles).toEqual([]);
    expect(result.current.attachmentInputRef.current.value).toBe('');

    await act(async () => {
      sendDeferred.resolve(undefined);
      await submitPromise;
    });

    expect(result.current.inputValue).toBe('');
    expect(result.current.clipboardImages).toEqual([]);
    expect(result.current.selectedReadableFiles).toEqual([]);
  });

  test('preserves text and attachments when send rejects', async () => {
    const onSendMessage = jest.fn(async () => {
      throw new Error('runtime unavailable');
    });
    const onBeforeSend = jest.fn();
    const clipboardImage = {
      base64: 'abc123',
      contentType: 'image/png',
      filename: 'pasted.png',
    };
    const readableFile = {
      filePath: '/tmp/context.txt',
      filename: 'context.txt',
      contentType: 'text/plain',
    };
    const { result } = renderHook(() => useChatComposerDraft({
      onSendMessage,
      onBeforeSend,
    }));

    act(() => {
      result.current.setInputValue('retry this with context');
      result.current.setClipboardImages([clipboardImage]);
      result.current.setSelectedReadableFiles([readableFile]);
      result.current.attachmentInputRef.current = { value: 'selected-file' };
    });

    let sendError = null;
    await act(async () => {
      try {
        await result.current.submitMessageValue(result.current.inputValue);
      } catch (error) {
        sendError = error;
      }
    });

    expect(sendError).toEqual(new Error('runtime unavailable'));
    expect(onBeforeSend).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith({
      text: 'retry this with context',
      clipboardImages: [clipboardImage],
      readableFiles: [readableFile],
    });
    expect(result.current.inputValue).toBe('retry this with context');
    expect(result.current.getInputValue()).toBe('retry this with context');
    expect(result.current.clipboardImages).toEqual([clipboardImage]);
    expect(result.current.selectedReadableFiles).toEqual([readableFile]);
    expect(result.current.attachmentInputRef.current.value).toBe('');
  });

  test('clears text and attachments after send resolves', async () => {
    const onSendMessage = jest.fn(async () => undefined);
    const clipboardImage = {
      base64: 'abc123',
      contentType: 'image/png',
      filename: 'pasted.png',
    };
    const readableFile = {
      filePath: '/tmp/context.txt',
      filename: 'context.txt',
      contentType: 'text/plain',
    };
    const { result } = renderHook(() => useChatComposerDraft({ onSendMessage }));

    act(() => {
      result.current.setInputValue('send this with context');
      result.current.setClipboardImages([clipboardImage]);
      result.current.setSelectedReadableFiles([readableFile]);
      result.current.attachmentInputRef.current = { value: 'selected-file' };
    });

    await act(async () => {
      await result.current.submitMessageValue(result.current.inputValue);
    });

    expect(onSendMessage).toHaveBeenCalledWith({
      text: 'send this with context',
      clipboardImages: [clipboardImage],
      readableFiles: [readableFile],
    });
    expect(result.current.inputValue).toBe('');
    expect(result.current.getInputValue()).toBe('');
    expect(result.current.clipboardImages).toEqual([]);
    expect(result.current.selectedReadableFiles).toEqual([]);
    expect(result.current.attachmentInputRef.current.value).toBe('');
  });
});
