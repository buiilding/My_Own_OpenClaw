import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import MessageInput from '../../frontend/src/renderer/features/chat/components/MessageInput';

let mockVoiceState;
let lastOnTranscriptionUpdate;
let lastOnUtteranceEnd;
const FILE_READER_DATA_URL = 'data:image/png;base64,ZmFrZS1iYXNlNjQ=';
const FILE_READER_BASE64 = 'ZmFrZS1iYXNlNjQ=';

jest.mock('../../frontend/src/renderer/features/voice/hooks/useVoiceMode', () => ({
  useVoiceMode: (_enabled, onTranscriptionUpdate, onUtteranceEnd) => {
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

  function buildImagePasteEvent() {
    return {
      clipboardData: {
        getData: jest.fn(() => ''),
        items: [
          {
            type: 'image/png',
            getAsFile: () => new Blob(['image'], { type: 'image/png' }),
          },
        ],
      },
    };
  }

  test('submits trimmed message text', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isSending={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: '  hello world  ', selectionStart: 13 } });
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).toHaveBeenCalledWith('hello world');
    expect(input.value).toBe('');
  });

  test('does not submit whitespace-only messages', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isSending={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: '   ', selectionStart: 3 } });
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  test('blocks submit when isSending is true', () => {
    const onSendMessage = jest.fn();
    const { rerender } = render(<MessageInput onSendMessage={onSendMessage} isSending={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: 'hello', selectionStart: 5 } });

    rerender(<MessageInput onSendMessage={onSendMessage} isSending />);
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Stop response' })).toBeInTheDocument();
  });

  test('send button is disabled for empty input', () => {
    render(<MessageInput onSendMessage={jest.fn()} isSending={false} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  test('auto-sends latest transcription when utterance ends in voice mode', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isSending={false} voiceModeEnabled />);

    const input = screen.getByLabelText('Type your message');
    expect(lastOnTranscriptionUpdate).toEqual(expect.any(Function));
    expect(lastOnUtteranceEnd).toEqual(expect.any(Function));

    act(() => {
      lastOnTranscriptionUpdate('hello from voice', true);
    });
    expect(input.value).toBe('hello from voice');

    act(() => {
      lastOnUtteranceEnd();
    });

    expect(onSendMessage).toHaveBeenCalledWith('hello from voice');
    expect(input.value).toBe('');
  });

  test('shows pasted image preview and sends it with the typed message', async () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isSending={false} />);

    const input = screen.getByLabelText('Type your message');

    await act(async () => {
      fireEvent.paste(input, buildImagePasteEvent());
    });

    expect(screen.getByAltText('Pasted image preview')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '  analyze this  ', selectionStart: 14 } });
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'analyze this',
        clipboardImage: expect.objectContaining({
          base64: FILE_READER_BASE64,
          contentType: 'image/png',
          filename: 'clipboard-image.png',
        }),
      }),
    );
    expect(screen.queryByAltText('Pasted image preview')).not.toBeInTheDocument();
  });

  test('allows removing pasted image preview before sending', async () => {
    render(<MessageInput onSendMessage={jest.fn()} isSending={false} />);

    const input = screen.getByLabelText('Type your message');

    await act(async () => {
      fireEvent.paste(input, buildImagePasteEvent());
    });

    expect(screen.getByAltText('Pasted image preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove pasted image' }));

    expect(screen.queryByAltText('Pasted image preview')).not.toBeInTheDocument();
  });
});
