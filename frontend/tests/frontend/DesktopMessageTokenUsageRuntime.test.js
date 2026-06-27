/**
 * Covers desktop message token usage runtime behavior in the frontend test suite.
 */

import { DesktopMessageTokenUsageRuntime } from '../../src/renderer/app/runtime/desktopMessageTokenUsageRuntime';

describe('desktopMessageTokenUsageRuntime', () => {
  const { resolveMessageTokenUsageTag } = DesktopMessageTokenUsageRuntime;

  test('prefers provider-reported token counts when attached to an assistant message', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'assistant',
      type: 'llm-text',
      text: 'final answer',
      tokenCounts: {
        visible_output_tokens: 3,
        thinking_tokens: 2,
        output_tokens_total: 5,
        total_tokens: 17,
        cached_tokens: 12,
        usage_source: 'provider',
      },
    });

    expect(tag).toBe('tokens(provider) out:5 vis:3 think:2 turn:17 cached:12');
  });

  test('uses fullUserMessage content and typed attachments for user token estimates', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'user',
      text: 'short text',
      fullUserMessage: {
        content: '12345678',
      },
      attachments: [{
        id: 'attachment-shot-1',
        kind: 'image',
        source: 'camera_button',
        status: 'ready',
        screenshotRef: 'shot-1',
      }],
    });

    expect(tag).toBe('tokens~ txt:2 img(est):85 total:87');
  });

  test('ignores legacy screenshot arrays for user image token estimates', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'user',
      text: 'abcd',
      screenshots: [
        { screenshotRef: 'shot-1' },
        { screenshotUrl: 'https://example.com/shot-2.png' },
      ],
    });

    expect(tag).toBe('tokens~ txt:1 img(est):0 total:1');
  });

  test('ignores whole-message screenshot aliases for user image token estimates', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'user',
      text: 'abcd',
      screenshotRef: 'shot-1',
      screenshotUrl: 'https://example.com/shot-1.png',
    });

    expect(tag).toBe('tokens~ txt:1 img(est):0 total:1');
  });

  test('estimates tool-call tokens from SDK display text', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'assistant',
      type: 'tool-call',
      text: '{}',
      toolCallDisplayText: '{ "name": "browser", "arguments": { "action": "navigate" } }',
    });

    expect(tag).toMatch(/^tokens~ \d+$/);
  });

  test('does not estimate tool-call tokens from provider-facing payload fallback', () => {
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

    expect(tag).toBeNull();
  });

  test('ignores raw tool-call text when canonical display fields are absent', () => {
    const tag = resolveMessageTokenUsageTag({
      sender: 'assistant',
      type: 'tool-call',
      text: 'ignored raw preview',
    });

    expect(tag).toBeNull();
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
