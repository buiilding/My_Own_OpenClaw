import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
    DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getTranscriptSessionInfo: () => ({ sessionId: 'session-1', userId: 'peter-bui' }),
}));

describe('SemanticMemorySection delete', () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockInvoke.mockReset();
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
        userId: 'peter-bui',
        memoryId: 'm-1',
      });
    });

    await waitFor(() => {
      const listCalls = mockInvoke.mock.calls.filter((call) => call[0] === 'list-semantic-memories');
      expect(listCalls.length).toBeGreaterThan(1);
    });
  });
});
