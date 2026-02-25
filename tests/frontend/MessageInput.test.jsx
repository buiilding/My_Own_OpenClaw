import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import MessageInput from '../../frontend/src/renderer/features/chat/components/MessageInput';

let mockVoiceState;
let lastOnTranscriptionUpdate;
let lastOnUtteranceEnd;

jest.mock('../../frontend/src/renderer/features/voice/hooks/useVoiceMode', () => ({
  useVoiceMode: (_enabled, onTranscriptionUpdate, onUtteranceEnd) => {
    lastOnTranscriptionUpdate = onTranscriptionUpdate;
    lastOnUtteranceEnd = onUtteranceEnd;
    return mockVoiceState;
  },
}));

describe('MessageInput', () => {
  beforeEach(() => {
    mockVoiceState = {
      isConnected: false,
      isRecording: false,
      error: null,
      clientId: null,
    };
    lastOnTranscriptionUpdate = undefined;
    lastOnUtteranceEnd = undefined;
  });

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
});
