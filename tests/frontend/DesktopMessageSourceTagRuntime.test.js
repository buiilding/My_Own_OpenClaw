/**
 * Covers desktop message source tag runtime behavior in the frontend test suite.
 */

import { resolveSourceTag } from '../../frontend/src/renderer/app/runtime/desktopMessageSourceTagRuntime';

describe('desktopMessageSourceTagRuntime', () => {
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
});
