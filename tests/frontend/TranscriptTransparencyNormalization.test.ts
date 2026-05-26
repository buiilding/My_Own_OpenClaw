import { normalizeTransparencyData } from '../../frontend/src/renderer/infrastructure/transcript/transparencyNormalization';

describe('normalizeTransparencyData', () => {
  test('returns null for empty or invalid transparency payloads', () => {
    expect(normalizeTransparencyData(null)).toBeNull();
    expect(normalizeTransparencyData(undefined)).toBeNull();
    expect(normalizeTransparencyData({})).toBeNull();
  });

  test('normalizes and trims transparency content fields', () => {
    const normalized = normalizeTransparencyData({
      systemPrompt: '  system prompt  ',
      toolSchemas: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }],
      fullUserMessage: {
        content: '  user text  ',
        metadata: { source: 'manual' },
      },
      fullAssistantMessage: {
        content: '  assistant text  ',
      },
    });

    expect(normalized).toEqual({
      systemPrompt: 'system prompt',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      fullUserMessage: {
        content: 'user text',
        metadata: { source: 'manual' },
      },
      fullAssistantMessage: {
        content: 'assistant text',
      },
    });
  });

  test('normalizes top-level function schemas without a type field', () => {
    const normalized = normalizeTransparencyData({
      toolSchemas: [{ name: 'read_file', parameters: { type: 'object' } }],
    });

    expect(normalized).toEqual({
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
    });
  });

  test('drops empty nested payloads while retaining valid metadata', () => {
    const normalized = normalizeTransparencyData({
      systemPrompt: '   ',
      fullUserMessage: {
        content: '   ',
        metadata: { branch: 'A' },
      },
      fullAssistantMessage: {
        content: '   ',
      },
    });

    expect(normalized).toEqual({
      fullUserMessage: {
        content: undefined,
        metadata: { branch: 'A' },
      },
    });
  });
});
