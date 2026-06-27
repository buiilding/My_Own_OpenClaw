/**
 * Covers desktop message source tag runtime behavior in the frontend test suite.
 */

import {
  DesktopMessageSourceTagRuntime,
} from '../../src/renderer/app/runtime/desktopMessageSourceTagRuntime';

describe('desktopMessageSourceTagRuntime', () => {
  const {
    resolveMessageSourceBadgePresentation,
    resolveSourceTag,
    resolveThinkingSourceBadgePresentation,
  } = DesktopMessageSourceTagRuntime;

  test('resolves known SDK event and channel labels', () => {
    expect(resolveSourceTag('tool-output', 'sdk-local-runtime')).toBe(
      'tool output / sdk-local-runtime',
    );
    expect(resolveSourceTag('streaming-complete', 'sdk:conversation-event')).toBe(
      'assistant completion / sdk:conversation-event',
    );
  });

  test('falls back for unknown event types and blank channels', () => {
    expect(resolveSourceTag('custom-event', '  ')).toBe(
      'custom-event event / unknown',
    );
    expect(resolveSourceTag(null, null)).toBe('unknown-source / unknown');
  });

  test('builds source badge presentation with transcript fallback and token tag', () => {
    expect(resolveMessageSourceBadgePresentation({
      sender: 'user',
      text: '12345678',
      screenshotRef: 'shot-1',
    })).toEqual({
      badgeText: 'transcript / unknown / tokens~ txt:2 img(est):85 total:87',
      title: 'source_event=transcript',
    });
    expect(resolveMessageSourceBadgePresentation({
      sender: 'assistant',
      type: 'tool-output',
      sourceEventType: 'tool-output',
      sourceChannel: 'sdk-local-runtime',
      text: 'abcd',
    })).toEqual({
      badgeText: 'tool output / sdk-local-runtime / tokens~ 1',
      title: 'source_event=tool-output',
    });
  });

  test('builds thinking source badge presentation from SDK conversation-event labels', () => {
    expect(resolveThinkingSourceBadgePresentation('assistant_delta')).toEqual({
      badgeText: 'assistant_delta event / sdk:conversation-event',
      title: 'source_event=assistant_delta',
    });
    expect(resolveThinkingSourceBadgePresentation('  ')).toEqual({
      badgeText: 'thinking token / sdk:conversation-event',
      title: 'source_event=llm-thought',
    });
  });
});
