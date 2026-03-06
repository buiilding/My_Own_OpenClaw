import { resolveMessageTokenUsageTag } from '../../frontend/src/renderer/features/chat/utils/message/messageTokenUsage';

describe('messageTokenUsage', () => {
  test('uses fullUserMessage content for user text token estimate and reports image estimate separately', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'user',
      text: 'short text',
      fullUserMessage: {
        content: '12345678',
      },
      screenshotRef: 'shot-1',
    });

    expect(tag).toBe('tokens~ txt:2 img(est):85 total:87');
  });

  test('counts user screenshots from screenshot attachment arrays', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'user',
      text: 'abcd',
      screenshots: [
        { screenshotRef: 'shot-1' },
        { screenshotUrl: 'https://example.com/shot-2.png' },
      ],
    });

    expect(tag).toBe('tokens~ txt:1 img(est):170 total:171');
  });

  test('estimates tool-call tokens from model-facing tool-call payload', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'assistant',
      type: 'tool-call',
      text: '{}',
      modelFacingToolCall: {
        id: 'tool_1',
        name: 'browser',
        arguments: { action: 'navigate', url: 'https://amazon.com' },
      },
    });

    expect(tag).toMatch(/^tokens~ \d+$/);
  });

  test('estimates tool-output tokens from model-facing output text', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'assistant',
      type: 'tool-output',
      text: 'fallback',
      modelFacingToolOutput: 'abcd',
    });

    expect(tag).toBe('tokens~ 1');
  });

  test('returns null for non-user and non-tool messages', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'assistant',
      type: 'llm-text',
      text: 'normal response',
    });

    expect(tag).toBeNull();
  });
});
