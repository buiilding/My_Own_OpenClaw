import {
  buildCurrentTurnMessagesFromProjection,
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

  test('buildCurrentTurnMessagesFromProjection creates overlay-ready active turn messages', () => {
    const messages = buildCurrentTurnMessagesFromProjection({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: 'Inspecting files',
      lastError: null,
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_call',
        toolName: 'read_file',
        text: 'Reading README.md',
        status: null,
        payload: { toolName: 'read_file' },
      }],
    });

    expect(buildCurrentTurnResponseOverlayEntries(messages)).toEqual([
      expect.objectContaining({
        type: 'tool-explanation',
        text: 'Reading README.md',
      }),
    ]);
  });
});
