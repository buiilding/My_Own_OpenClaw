import { render, screen, waitFor } from '@testing-library/react';

const {
  mockInvoke,
  resetSemanticMemoryHarness,
  SEMANTIC_MEMORY_USER_ID,
} = require('./__mocks__/semanticMemorySectionHarness.cjs');

describe('SemanticMemorySection', () => {
  beforeEach(() => {
    resetSemanticMemoryHarness();
  });

  test('loads and renders semantic memories from IPC', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        memories: [
          {
            id: 'semantic-1',
            content: 'Summary: User prefers concise updates.\nFacts:\n- Prefers telegraph style',
            timestamp: '2026-02-02T21:00:59',
            metadata: {},
          },
        ],
      },
    });

    const { default: SemanticMemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/SemanticMemorySection'
    );

    render(<SemanticMemorySection />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list-semantic-memories', {
        userId: SEMANTIC_MEMORY_USER_ID,
        limit: 200,
      });
    });

    expect(screen.getByText('Semantic Memory')).toBeInTheDocument();
    expect(screen.getAllByText('User prefers concise updates.').length).toBeGreaterThan(0);
    expect(screen.getByText('- Prefers telegraph style')).toBeInTheDocument();
  });
});
