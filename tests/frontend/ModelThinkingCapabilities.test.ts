import { resolveThinkingCapabilities } from '../../frontend/src/renderer/features/chat/utils/modelThinkingCapabilities';

describe('modelThinkingCapabilities', () => {
  test('infers Gemini thinking support when capability flags are absent', () => {
    expect(
      resolveThinkingCapabilities(
        'gemini-2.5-pro',
        'gemini',
        { local: [], online: [{ id: 'gemini-2.5-pro', provider: 'gemini' }] },
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
