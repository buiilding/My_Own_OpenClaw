/**
 * Covers desktop message input runtime behavior in the frontend test suite.
 */

import { DesktopMessageInputRuntime } from '../../src/renderer/app/runtime/desktopMessageInputRuntime';

describe('desktopMessageInputRuntime', () => {
  const {
    buildOutgoingMessage,
    focusTextInputAtEnd,
  } = DesktopMessageInputRuntime;

  test('returns null for blank/whitespace-only messages', () => {
    expect(buildOutgoingMessage('', false)).toBeNull();
    expect(buildOutgoingMessage('   \n\t', false)).toBeNull();
  });

  test('returns trimmed message for non-empty input', () => {
    expect(buildOutgoingMessage('  hello world  ', false)).toBe('hello world');
  });

  test('buildOutgoingMessage blocks sends while submit is blocked', () => {
    expect(buildOutgoingMessage('hello', true)).toBeNull();
  });

  test('buildOutgoingMessage delegates to normalized text when sending is allowed', () => {
    expect(buildOutgoingMessage('  hello world  ', false)).toBe('hello world');
  });

  test('buildOutgoingMessage returns null for whitespace even when sending is allowed', () => {
    expect(buildOutgoingMessage('   ', false)).toBeNull();
  });

  test('buildOutgoingMessage includes normalized clipboardImages payload', () => {
    const result = buildOutgoingMessage('  hello  ', false, [
      { base64: 'abc', contentType: 'image/png' },
      { base64: '' },
      null,
    ]);
    expect(result).toEqual({
      text: 'hello',
      clipboardImages: [{ base64: 'abc', contentType: 'image/png' }],
      readableFiles: [],
    });
  });

  test('buildOutgoingMessage includes normalized readableFiles payload', () => {
    const result = buildOutgoingMessage('  hello  ', false, [], [
      { filePath: '/tmp/a.txt', filename: 'a.txt' },
      { filePath: '', filename: 'b.txt' },
      null,
    ]);
    expect(result).toEqual({
      text: 'hello',
      clipboardImages: [],
      readableFiles: [{ filePath: '/tmp/a.txt', filename: 'a.txt' }],
    });
  });

  test('buildOutgoingMessage allows attachment-only send with default text', () => {
    const result = buildOutgoingMessage('   ', false, [], [
      { filePath: '/tmp/a.txt', filename: 'a.txt' },
    ]);
    expect(result).toEqual({
      text: 'Please review the attached files.',
      clipboardImages: [],
      readableFiles: [{ filePath: '/tmp/a.txt', filename: 'a.txt' }],
    });
  });

  test('focusTextInputAtEnd focuses input and moves caret to text end', () => {
    const input = {
      value: 'hello',
      focus: jest.fn(),
      setSelectionRange: jest.fn(),
    };

    expect(focusTextInputAtEnd(input)).toBe(true);
    expect(input.focus).toHaveBeenCalledTimes(1);
    expect(input.setSelectionRange).toHaveBeenCalledWith(5, 5);
  });

  test('focusTextInputAtEnd tolerates unavailable inputs and missing selection APIs', () => {
    expect(focusTextInputAtEnd(null)).toBe(false);

    const input = {
      value: 'hello',
      focus: jest.fn(),
    };

    expect(focusTextInputAtEnd(input)).toBe(true);
    expect(input.focus).toHaveBeenCalledTimes(1);
  });
});
