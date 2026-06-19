/**
 * Covers chat stream formatting. behavior in the frontend test suite.
 */

import {
  buildThinkingStatus,
} from '../../frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime';

describe('desktopChatStreamThinkingRuntime', () => {
  test('trims thinking status to max window while appending chunks', () => {
    const longPrefix = 'a'.repeat(5000);
    const next = buildThinkingStatus(longPrefix, 'xyz');

    expect(next).toHaveLength(5000);
    expect(next.endsWith('xyz')).toBe(true);
  });

  test('buildThinkingStatus handles null inputs safely', () => {
    expect(buildThinkingStatus(null, undefined)).toBe('');
    expect(buildThinkingStatus('base', undefined)).toBe('base');
  });
});
