import {
  buildCurrentTurnResponseOverlayEntries,
  isResponseCloseable,
  normalizeThinkingText,
  resolveSourceTagForResponse,
  shouldRenderResponseMarkdown,
} from '../../frontend/src/renderer/features/chat/utils/state/chatBoxResponseState';

describe('chatBoxResponseState', () => {
  test('isResponseCloseable allows complete and error responses', () => {
    expect(isResponseCloseable(null)).toBe(false);
    expect(isResponseCloseable({ type: 'llm-text', isComplete: false })).toBe(false);
    expect(isResponseCloseable({ type: 'llm-text', isComplete: true })).toBe(true);
    expect(isResponseCloseable({ type: 'error', isComplete: false })).toBe(true);
  });

  test('normalizeThinkingText trims string input and normalizes non-string to empty', () => {
    expect(normalizeThinkingText('  Thinking...  ')).toBe('Thinking...');
    expect(normalizeThinkingText('')).toBe('');
    expect(normalizeThinkingText(null)).toBe('');
  });

  test('shouldRenderResponseMarkdown excludes non-llm overlay entry types', () => {
    expect(shouldRenderResponseMarkdown(null)).toBe(false);
    expect(shouldRenderResponseMarkdown({ type: 'tool-call' })).toBe(false);
    expect(shouldRenderResponseMarkdown({ type: 'error' })).toBe(false);
    expect(shouldRenderResponseMarkdown({ type: 'search-source' })).toBe(false);
    expect(shouldRenderResponseMarkdown({ type: 'llm-text' })).toBe(true);
  });

  test('resolveSourceTagForResponse respects dev/show toggles and defaults unknown metadata', () => {
    expect(resolveSourceTagForResponse({
      visibleResponse: { sourceEventType: 'streaming-response', sourceChannel: 'from-backend' },
      showResponse: false,
      devUiEnabled: true,
    })).toBeNull();

    expect(resolveSourceTagForResponse({
      visibleResponse: { sourceEventType: 'streaming-response', sourceChannel: 'from-backend' },
      showResponse: true,
      devUiEnabled: false,
    })).toBeNull();

    expect(resolveSourceTagForResponse({
      visibleResponse: {},
      showResponse: true,
      devUiEnabled: true,
    })).toBe('unknown-source · unknown');
  });

  test('buildCurrentTurnResponseOverlayEntries ignores non-tool explanatory rows without tool-call content', () => {
    expect(buildCurrentTurnResponseOverlayEntries([
      { id: 'user-1', sender: 'user', text: 'find the answer' },
      { id: 'assistant-1', sender: 'assistant', type: 'tool-explanation', text: 'Searching https://example.com' },
    ])).toEqual([]);
  });
});
