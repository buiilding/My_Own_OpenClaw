/**
 * Covers message input. behavior in the frontend test suite.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import MessageInput from '../../src/renderer/features/chat/components/MessageInput';

let mockVoiceState;
let lastOnTranscriptionUpdate;
let lastOnUtteranceEnd;
let lastVoiceEnabled;
const FILE_READER_DATA_URL = 'data:image/png;base64,ZmFrZS1iYXNlNjQ=';
const FILE_READER_BASE64 = 'ZmFrZS1iYXNlNjQ=';

jest.mock('../../src/renderer/features/voice/hooks/useVoiceMode', () => ({
  useVoiceMode: (_enabled, onTranscriptionUpdate, onUtteranceEnd) => {
    lastVoiceEnabled = _enabled;
    lastOnTranscriptionUpdate = onTranscriptionUpdate;
    lastOnUtteranceEnd = onUtteranceEnd;
    return mockVoiceState;
  },
}));

describe('MessageInput', () => {
  const originalFileReader = global.FileReader;

  beforeEach(() => {
    mockVoiceState = {
      isConnected: false,
      isRecording: false,
      error: null,
      clientId: null,
    };
    lastOnTranscriptionUpdate = undefined;
    lastOnUtteranceEnd = undefined;
    lastVoiceEnabled = undefined;
    global.FileReader = class MockFileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        this.result = FILE_READER_DATA_URL;
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
  });

  function buildImagePasteEvent(itemCount = 1) {
    return {
      clipboardData: {
        getData: jest.fn(() => ''),
        items: Array.from({ length: itemCount }).map(() => ({
          type: 'image/png',
          getAsFile: () => new Blob(['image'], { type: 'image/png' }),
        })),
      },
    };
  }

  test('submits trimmed message text', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isLoopActive={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: '  hello world  ', selectionStart: 13 } });
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).toHaveBeenCalledWith('hello world');
    expect(input.value).toBe('');
  });

  test('does not submit whitespace-only messages', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isLoopActive={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: '   ', selectionStart: 3 } });
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  test('blocks submit when isLoopActive is true', () => {
    const onSendMessage = jest.fn();
    const { rerender } = render(<MessageInput onSendMessage={onSendMessage} isLoopActive={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: 'hello', selectionStart: 5 } });

    rerender(<MessageInput onSendMessage={onSendMessage} isLoopActive />);
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Stop response' })).toBeInTheDocument();
  });

  test('disables side controls while loop is active', () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive />);

    expect(screen.getByTestId('plus-btn')).toBeDisabled();
    expect(screen.getByTestId('voice-btn')).toBeDisabled();
  });

  test('send button is disabled for empty input', () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  test('keeps the composer unchanged when transport is disconnected', () => {
    render(
      <MessageInput
        onSendMessage={jest.fn()}
        isLoopActive={false}
        isTransportConnected={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Type your message'), {
      target: { value: 'send anyway', selectionStart: 10 },
    });

    expect(screen.queryByTestId('message-input-offline-state')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    expect(screen.getByLabelText('Type your message')).toHaveClass('message-input');
  });

  test('keeps latest transcription in composer when utterance ends in voice mode', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isLoopActive={false} />);

    const input = screen.getByLabelText('Type your message');
    const voiceButton = screen.getByTestId('voice-btn');
    expect(lastOnTranscriptionUpdate).toEqual(expect.any(Function));
    expect(lastOnUtteranceEnd).toEqual(expect.any(Function));

    fireEvent.click(voiceButton);

    act(() => {
      lastOnTranscriptionUpdate('hello from voice', true);
    });
    expect(input.value).toBe('hello from voice');

    act(() => {
      lastOnUtteranceEnd();
    });

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(input.value).toBe('hello from voice');
    expect(voiceButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('toggles a transient voice session from the microphone button', () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    const voiceButton = screen.getByTestId('voice-btn');
    expect(lastVoiceEnabled).toBe(false);
    expect(voiceButton).toHaveAttribute('aria-pressed', 'false');
    expect(voiceButton).toHaveAttribute('aria-label', 'Start voice input');

    fireEvent.click(voiceButton);

    expect(lastVoiceEnabled).toBe(true);
    expect(voiceButton).toHaveAttribute('aria-pressed', 'true');
    expect(voiceButton).toHaveAttribute('aria-label', 'Stop voice input');

    fireEvent.click(voiceButton);

    expect(lastVoiceEnabled).toBe(false);
    expect(voiceButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('shows pasted image preview and sends it with the typed message', async () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isLoopActive={false} />);

    const input = screen.getByLabelText('Type your message');

    await act(async () => {
      fireEvent.paste(input, buildImagePasteEvent());
    });

    expect(screen.getByAltText(/Pasted image preview/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '  analyze this  ', selectionStart: 14 } });
    fireEvent.submit(input.closest('form'));

    const [firstCallPayload] = onSendMessage.mock.calls[0] || [];
    expect(firstCallPayload?.text === 'analyze this').toBe(true);
    expect(Boolean(
      Array.isArray(firstCallPayload?.clipboardImages)
      && firstCallPayload.clipboardImages.length === 1
      && typeof firstCallPayload.clipboardImages[0]?.base64 === 'string'
      && firstCallPayload.clipboardImages[0].base64.includes(FILE_READER_BASE64)
      && firstCallPayload.clipboardImages[0].contentType === 'image/png'
      && firstCallPayload.clipboardImages[0].filename === 'clipboard-image.png',
    )).toBe(true);
    expect(screen.queryAllByAltText(/Pasted image preview/i).length === 0).toBe(true);
  });

  test('allows removing pasted image preview before sending', async () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    const input = screen.getByLabelText('Type your message');

    await act(async () => {
      fireEvent.paste(input, buildImagePasteEvent());
    });

    expect(screen.getByAltText(/Pasted image preview/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Remove pasted image/i }));

    expect(screen.queryAllByAltText(/Pasted image preview/i).length === 0).toBe(true);
  });

  test('appends a second pasted image instead of replacing the first', async () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    const input = screen.getByLabelText('Type your message');

    await act(async () => {
      fireEvent.paste(input, buildImagePasteEvent());
    });
    await act(async () => {
      fireEvent.paste(input, buildImagePasteEvent());
    });

    expect(screen.getByAltText('Pasted image preview 1')).toBeInTheDocument();
    expect(screen.getByAltText('Pasted image preview 2')).toBeInTheDocument();
  });

  test('focuses textarea when focus request token changes', () => {
    const { rerender } = render(
      <MessageInput
        onSendMessage={jest.fn()}
        isLoopActive={false}
        focusRequestToken={0}
      />,
    );

    const input = screen.getByLabelText('Type your message');
    input.blur();
    expect(document.activeElement).not.toBe(input);

    rerender(
      <MessageInput
        onSendMessage={jest.fn()}
        isLoopActive={false}
        focusRequestToken={1}
      />,
    );

    expect(document.activeElement).toBe(input);
  });

  test('opens add-attachment menu from plus button and closes on outside click', () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    fireEvent.click(screen.getByTestId('plus-btn'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Add photos & files')).toBeInTheDocument();
    expect(screen.queryByText('Create image')).not.toBeInTheDocument();
    expect(screen.queryByText('Deep research')).not.toBeInTheDocument();
    expect(screen.queryByText('Shopping research')).not.toBeInTheDocument();
    expect(screen.queryByText('Web search')).not.toBeInTheDocument();
    expect(screen.queryByText('More')).not.toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Add photos & files')).not.toBeInTheDocument();
  });

  test('closes add-attachment menu when loop becomes active', () => {
    const { rerender } = render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    fireEvent.click(screen.getByTestId('plus-btn'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    rerender(<MessageInput onSendMessage={jest.fn()} isLoopActive />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('opens native file picker when selecting add photos & files', () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    const attachmentInput = screen.getByTestId('attachment-input');
    const clickSpy = jest.spyOn(attachmentInput, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByTestId('plus-btn'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Add photos & files/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  test('includes selected readable files in outgoing payload and shows file name', async () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isLoopActive={false} />);

    const attachmentInput = screen.getByTestId('attachment-input');
    const imageFile = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(textFile, 'path', {
      value: '/tmp/notes.txt',
      configurable: true,
    });

    await act(async () => {
      fireEvent.change(attachmentInput, {
        target: {
          files: [imageFile, textFile],
        },
      });
    });

    expect(screen.getByAltText(/Pasted image preview/i)).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText('TXT')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Type your message'), {
      target: { value: 'Review attachments', selectionStart: 18 },
    });
    fireEvent.submit(screen.getByTestId('composer-container'));

    const [firstCallPayload] = onSendMessage.mock.calls[0] || [];
    expect(firstCallPayload?.text).toBe('Review attachments');
    expect(Array.isArray(firstCallPayload?.clipboardImages)).toBe(true);
    expect(Array.isArray(firstCallPayload?.readableFiles)).toBe(true);
    expect(firstCallPayload?.readableFiles).toEqual([
      expect.objectContaining({
        filePath: '/tmp/notes.txt',
        filename: 'notes.txt',
      }),
    ]);
  });

  test('logs selected attachment parse failures without throwing from the handler', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const readError = new Error('reader failed');
    global.FileReader = class RejectingFileReader {
      constructor() {
        this.result = null;
        this.error = readError;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        if (typeof this.onerror === 'function') {
          this.onerror();
        }
      }
    };

    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('attachment-input'), {
        target: {
          files: [new File(['image'], 'broken.png', { type: 'image/png' })],
        },
      });
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[MessageInput] Failed to parse selected attachments:',
      readError,
    );
    warnSpy.mockRestore();
  });

  test('logs pasted image parse failures without throwing from the handler', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const readError = new Error('paste reader failed');
    global.FileReader = class RejectingFileReader {
      constructor() {
        this.result = null;
        this.error = readError;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        if (typeof this.onerror === 'function') {
          this.onerror();
        }
      }
    };

    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    await act(async () => {
      fireEvent.paste(screen.getByLabelText('Type your message'), buildImagePasteEvent());
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[MessageInput] Failed to parse pasted image:',
      readError,
    );
    warnSpy.mockRestore();
  });

  test('enables send button for attachment-only message', async () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isLoopActive={false} />);

    const attachmentInput = screen.getByTestId('attachment-input');
    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(textFile, 'path', {
      value: '/tmp/notes.txt',
      configurable: true,
    });

    await act(async () => {
      fireEvent.change(attachmentInput, {
        target: {
          files: [textFile],
        },
      });
    });

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeEnabled();

    fireEvent.click(sendButton);
    const [firstCallPayload] = onSendMessage.mock.calls[0] || [];
    expect(firstCallPayload?.text).toBe('Please review the attached files.');
  });

  test('does not render thinking dropdown control next to add attachment', () => {
    render(<MessageInput onSendMessage={jest.fn()} isLoopActive={false} />);

    expect(screen.queryByTestId('thinking-mode-btn')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Close thinking mode')).not.toBeInTheDocument();
  });
});
