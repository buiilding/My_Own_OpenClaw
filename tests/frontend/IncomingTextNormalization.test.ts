import {
  normalizeIncomingText,
  normalizeOptionalIncomingText,
} from '../../frontend/src/renderer/infrastructure/text/incomingTextNormalization';

describe('incomingTextNormalization', () => {
  test('repairs mojibake and lone surrogates while preserving valid emoji pairs', () => {
    expect(normalizeIncomingText('Hello â€œworldâ€\u009d')).toBe('Hello “world”');
    expect(normalizeIncomingText('bad\udc9d')).toBe('bad�');
    expect(normalizeIncomingText('Hey! 👋')).toBe('Hey! 👋');
  });

  test('normalizes unknown values to empty string', () => {
    expect(normalizeIncomingText(null)).toBe('');
    expect(normalizeIncomingText(42)).toBe('');
  });

  test('returns trimmed optional text or null when empty', () => {
    expect(normalizeOptionalIncomingText('  hello  ')).toBe('hello');
    expect(normalizeOptionalIncomingText('   ')).toBeNull();
  });
});
