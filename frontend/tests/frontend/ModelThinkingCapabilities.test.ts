/**
 * Covers model thinking capabilities. behavior in the frontend test suite.
 */

import { DesktopModelThinkingRuntime } from '../../src/renderer/app/runtime/desktopModelThinkingRuntime';

describe('desktopModelThinkingRuntime', () => {
  const {
    resolveThinkingCapabilities,
  } = DesktopModelThinkingRuntime;

  test('does not infer thinking support when model metadata omits capability flags', () => {
    expect(
      resolveThinkingCapabilities(
        'gemini-2.5-pro',
        'gemini',
        { local: [], online: [{ id: 'gemini-2.5-pro', provider: 'gemini' }] },
      ),
    ).toEqual({
      supportsThinking: false,
      supportsThinkingTextStream: false,
    });
  });

  test('respects explicit no thought-text stream flag when provided by model metadata', () => {
    expect(
      resolveThinkingCapabilities(
        'gemini-3.1-pro-preview',
        'gemini',
        {
          local: [],
          online: [
            {
              id: 'gemini-3.1-pro-preview',
              provider: 'gemini',
              supports_thinking: true,
              supports_thinking_text_stream: false,
            },
          ],
        },
      ),
    ).toEqual({
      supportsThinking: true,
      supportsThinkingTextStream: false,
    });
  });

  test('uses explicit capability flags when provided by model metadata', () => {
    expect(
      resolveThinkingCapabilities(
        'gpt-5',
        'openai',
        {
          local: [],
          online: [
            {
              id: 'gpt-5',
              provider: 'openai',
              supports_thinking: true,
              supports_thinking_text_stream: true,
            },
          ],
        },
      ),
    ).toEqual({
      supportsThinking: true,
      supportsThinkingTextStream: true,
    });
  });
});
