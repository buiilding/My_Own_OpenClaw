/**
 * Covers desktop model-card presentation runtime behavior in the frontend test suite.
 */

import {
  DesktopModelCardPresentationRuntime,
} from '../../src/renderer/app/runtime/desktopModelCardPresentationRuntime';

const {
  normalizeProviderLabel,
  toModelCard,
  toProviderCards,
} = DesktopModelCardPresentationRuntime;

describe('desktopModelCardPresentationRuntime', () => {
  test('toModelCard prefers backend catalog metadata', () => {
    expect(toModelCard({
      id: 'gemini-2.5-flash@@gemini-2-5-flash-nonthinking',
      provider: 'gemini',
      display_name: 'Gemini 2.5 Flash',
      description: 'Provider-sourced description',
      context_window: 1048576,
      input_price: 'Free',
      output_price: 'Free',
      latency: '~1.0s',
      strengths: ['Multimodal', 'Fast', 'Search', '1M Context'],
      supports_thinking: false,
    }, false)).toEqual({
      id: 'gemini-2.5-flash@@gemini-2-5-flash-nonthinking',
      displayName: 'Gemini 2.5 Flash',
      provider: 'gemini',
      description: 'Provider-sourced description',
      context: '1,048,576 tokens',
      inputPrice: 'Free',
      outputPrice: 'Free',
      latency: '~1.0s',
      strengths: ['Multimodal', 'Fast', 'Search', '1M Context'],
      badge: 'Non-thinking',
    });
  });

  test('toModelCard falls back to generic provider heuristics when backend metadata is absent', () => {
    const card = toModelCard({
      id: 'gemini-3-flash-preview@@gemini-3-flash-high-thinking',
      provider: 'gemini',
    }, true);

    expect(card.description).toBe('Powerful model family with native multimodal understanding.');
    expect(card.context).toBe('Context unknown');
    expect(card.inputPrice).toBe('Free');
    expect(card.outputPrice).toBe('Free');
    expect(card.latency).toBe('~1.5s');
    expect(card.strengths).toEqual(['Multimodal', 'Search', 'Code', 'Efficiency']);
    expect(card.badge).toBe('Recommended');
  });

  test('toProviderCards groups by normalized provider label', () => {
    const cards = toProviderCards([
      { id: 'a', provider: 'openai' },
      { id: 'b', provider: 'openai' },
      { id: 'c', provider: 'gemini' },
      { id: 'd', provider: null },
    ], 'c', 'gemini');

    expect(cards).toEqual([
      { provider: 'gemini', count: 1, hasSelectedModel: true },
      { provider: 'openai', count: 2, hasSelectedModel: false },
      { provider: 'Unknown provider', count: 1, hasSelectedModel: false },
    ]);
  });

  test('normalizeProviderLabel trims values and keeps unknown fallback', () => {
    expect(normalizeProviderLabel('  openai  ')).toBe('openai');
    expect(normalizeProviderLabel('')).toBe('Unknown provider');
    expect(normalizeProviderLabel(null)).toBe('Unknown provider');
  });
});
