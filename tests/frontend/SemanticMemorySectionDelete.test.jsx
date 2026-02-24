import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  mockInvoke,
  resetSemanticMemoryHarness,
  SEMANTIC_MEMORY_USER_ID,
} = require('./__mocks__/semanticMemorySectionHarness.cjs');

describe('SemanticMemorySection delete', () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    resetSemanticMemoryHarness();
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    window.confirm = originalConfirm;
  });

  test('right click shows delete menu and invokes delete', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'list-semantic-memories') {
        return Promise.resolve({
          success: true,
          data: {
            memories: [
              {
                id: 'm-1',
                content: 'Summary: A\nFacts:\n- F1',
                timestamp: '2026-02-02T21:00:59',
                metadata: {},
              },
            ],
          },
        });
      }
      if (channel === 'delete-semantic-memory') {
        return Promise.resolve({ success: true, data: { deleted: true } });
      }
      return Promise.resolve({ success: true, data: {} });
    });

    const { default: SemanticMemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/SemanticMemorySection'
    );

    render(<SemanticMemorySection />);

    await screen.findByText('A');

    fireEvent.contextMenu(screen.getAllByText('A')[0].closest('button'));

    await screen.findByRole('menu');
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('delete-semantic-memory', {
        userId: SEMANTIC_MEMORY_USER_ID,
        memoryId: 'm-1',
      });
    });

    await waitFor(() => {
      const listCalls = mockInvoke.mock.calls.filter((call) => call[0] === 'list-semantic-memories');
      expect(listCalls.length).toBeGreaterThan(1);
    });
  });
});
