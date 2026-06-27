/**
 * Covers chat stream formatting. behavior in the frontend test suite.
 */

import { DesktopChatStreamThinkingRuntime } from '../../src/renderer/app/runtime/desktopChatStreamThinkingRuntime';

const {
  buildThinkingStatus,
  getCompactionCompletedThinkingStatus,
  getCompactionFailedThinkingStatus,
  getCompactionStartedThinkingStatus,
  getGenericThinkingStatus,
  isGenericThinkingStatus,
  resolveCompactionFailedThinkingStatus,
} = DesktopChatStreamThinkingRuntime;

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

  test('exposes thinking labels through semantic helpers', () => {
    expect(getGenericThinkingStatus()).toBe('Thinking...');
    expect(isGenericThinkingStatus('Thinking...')).toBe(true);
    expect(isGenericThinkingStatus('Other')).toBe(false);
    expect(getCompactionStartedThinkingStatus()).toBe('Compacting conversation history...');
    expect(getCompactionCompletedThinkingStatus()).toBe('Conversation history compacted.');
    expect(getCompactionFailedThinkingStatus()).toBe('Conversation compaction failed.');
    expect(resolveCompactionFailedThinkingStatus('backend failed')).toBe('backend failed');
    expect(resolveCompactionFailedThinkingStatus('')).toBe('Conversation compaction failed.');
  });
});
